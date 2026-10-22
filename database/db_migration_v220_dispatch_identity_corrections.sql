begin;
create table if not exists public.logistics_dispatch_corrections (
 id uuid primary key default gen_random_uuid(), request_key uuid not null unique,
 dispatch_id uuid not null references public.logistics_dispatches(id), actor_id uuid not null,
 code text not null, delivery_date date not null, carrier_name text not null,
 reason text not null, request jsonb not null, source_rows jsonb not null default '[]',
 before_value jsonb not null, after_value jsonb not null, result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.logistics_dispatch_corrections enable row level security;
revoke all on public.logistics_dispatch_corrections from public,anon,authenticated;
grant all on public.logistics_dispatch_corrections to service_role;
create index if not exists dispatch_corrections_code on public.logistics_dispatch_corrections(code,created_at,id);
create index if not exists dispatch_corrections_order on public.logistics_dispatch_corrections(created_at,id);

-- A full snapshot is also the optimistic concurrency token for the impact preview.
create or replace function public.logistics_correction_state(p_dispatch uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 with routes as (
  select route_sheet_id id from logistics_dispatch_routes where dispatch_id=p_dispatch
  union select s.route_sheet_id from treasury_settlements s join logistics_dispatch_settlements l on l.settlement_id=s.id where l.dispatch_id=p_dispatch and s.route_sheet_id is not null
  union select d.route_sheet_id from deliveries d join logistics_dispatch_attempts a on a.delivery_id=d.id where a.dispatch_id=p_dispatch and d.route_sheet_id is not null
 ), ds as (select d.* from deliveries d where d.route_sheet_id in(select id from routes) or d.id in(select delivery_id from logistics_dispatch_attempts where dispatch_id=p_dispatch)),
 ss as (select s.* from treasury_settlements s where s.route_sheet_id in(select id from routes) or s.id in(select settlement_id from logistics_dispatch_settlements where dispatch_id=p_dispatch)),
 payments as (select transaction_id id from logistics_dispatch_movements where dispatch_id=p_dispatch union select transaction_id from logistics_freight_payment_allocations where dispatch_id=p_dispatch union select carrier_payout_transaction_id from route_sheets where id in(select id from routes))
 select jsonb_build_object(
 'dispatch',(select to_jsonb(d) from logistics_dispatches d where id=p_dispatch),
 'plan',(select to_jsonb(p) from logistics_dispatch_plans p where dispatch_id=p_dispatch),
 'routes',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from route_sheets r where id in(select id from routes)),'[]'),
 'deliveries',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from ds d),'[]'),
 'settlements',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from ss s),'[]'),
 'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from logistics_dispatch_attempts a where dispatch_id=p_dispatch),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from cash_transactions t where id in(select id from payments)),'[]'),
 'liquidation',(select to_jsonb(l) from logistics_dispatch_liquidations l where dispatch_id=p_dispatch),
 'terms',(select to_jsonb(t) from logistics_freight_settlement_terms t where dispatch_id=p_dispatch));
$$;
revoke all on function public.logistics_correction_state(uuid) from public,anon,authenticated;

create or replace function public.preview_dispatch_correction(p_actor uuid,p_dispatch uuid,p_version integer,p_data jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s jsonb; d logistics_dispatches; p logistics_dispatch_plans; c carriers; target_date date;
 blockers jsonb='[]'; warnings jsonb='[]'; carrier_changed boolean; route_ids uuid[]; delivery_ids uuid[];
begin
 if not can_plan_logistics(p_actor) then raise exception 'Sin permiso para corregir recorridos.' using errcode='42501';end if;
 select * into d from logistics_dispatches where id=p_dispatch;
 select * into p from logistics_dispatch_plans where dispatch_id=p_dispatch;
 if d.id is null or p.dispatch_id is null then raise exception 'El LOG no tiene una planificación editable.';end if;
 if p.version is distinct from p_version then raise exception 'El recorrido cambió. Volvé a consultar el impacto.' using errcode='40001';end if;
 target_date=(p_data->>'deliveryDate')::date;
 select * into c from carriers where id=(p_data->>'carrierId')::uuid and is_active is true;
 if target_date is null or c.id is null then raise exception 'Elegí fecha y fletero válidos.';end if;
 if length(trim(coalesce(p_data->>'reason',''))) not between 10 and 2000 then raise exception 'Explicá el motivo de la corrección (10 a 2000 caracteres).';end if;
 if length(coalesce(p_data->>'driverName',''))>160 then raise exception 'Nombre de chofer demasiado largo.';end if;
 if d.delivery_date=target_date and p.carrier_id=c.id and coalesce(p.planned->>'driverName','')=coalesce(p_data->>'driverName','') then raise exception 'No hay cambios para corregir.';end if;
 s=logistics_correction_state(p_dispatch);carrier_changed=p.carrier_id<>c.id;
 select coalesce(array_agg((v->>'id')::uuid),'{}') into route_ids from jsonb_array_elements(s->'routes') v;
 select coalesce(array_agg((v->>'id')::uuid),'{}') into delivery_ids from jsonb_array_elements(s->'deliveries') v;
 if p.status='cancelled' then blockers=blockers||jsonb_build_array('El LOG está cancelado; revisá su restauración antes de corregirlo.');end if;
 if exists(select 1 from jsonb_array_elements(s->'settlements') x where x->>'status'<>'draft') then blockers=blockers||jsonb_build_array('Hay rendiciones confirmadas o archivadas. Tesorería debe reabrirlas antes de corregir el recorrido.');end if;
 if exists(select 1 from logistics_dispatch_routes where route_sheet_id=any(route_ids) and dispatch_id<>p_dispatch)
 or exists(select 1 from logistics_dispatch_attempts where delivery_id=any(delivery_ids) and dispatch_id<>p_dispatch)
 then blockers=blockers||jsonb_build_array('Hay entregas o recorridos compartidos con otro LOG. Revisá esos vínculos antes de corregir.');end if;
 if exists(select 1 from route_sheets r join jsonb_array_elements(s->'routes') original on r.run_number=(original->>'run_number')::int where r.delivery_date=target_date and r.carrier_id=c.id and not r.id=any(route_ids)) then
 blockers=blockers||jsonb_build_array('Ya existe un recorrido para ese fletero, fecha y número de carga. Revisá el conflicto antes de corregir.');end if;
 if exists(select 1 from deliveries other join jsonb_array_elements(s->'deliveries') original on other.order_id=(original->>'order_id')::uuid and other.run_number=(original->>'run_number')::int where other.delivery_date=target_date and other.carrier_id=c.id and not other.id=any(delivery_ids)) then
 blockers=blockers||jsonb_build_array('Un pedido ya tiene otra entrega para ese fletero, fecha y carga. Revisá la entrega duplicada.');end if;
 if exists(select 1 from logistics_dispatch_attempts a join logistics_dispatches other on other.id=a.dispatch_id where a.dispatch_id<>p_dispatch and a.executed and other.delivery_date=target_date and a.order_id in(select (x->>'order_id')::uuid from jsonb_array_elements(s->'deliveries') x)) then
 blockers=blockers||jsonb_build_array('Un pedido ya figura ejecutado en otro LOG de esa fecha. Revisá sus vínculos antes de corregir.');end if;
 if carrier_changed and (s->'liquidation'<>'null'::jsonb or coalesce(s->'terms'->>'status','')='paid') then blockers=blockers||jsonb_build_array('El flete tiene una liquidación aprobada. Tesorería debe revisar su liquidación antes de cambiar el fletero.');end if;
 if jsonb_array_length(s->'payments')>0 then warnings=warnings||jsonb_build_array('Hay pagos vinculados. Se conservarán sus importes, fechas y códigos; revisá que correspondan al recorrido corregido.');end if;
 if carrier_changed or d.delivery_date<>target_date then warnings=warnings||jsonb_build_array('La tarifa prevista quedará pendiente de revisión. Los importes ya acordados o aprobados se conservan.');end if;
 return jsonb_build_object('token',md5(s::text||p_data::text),'code',d.code,'beforeDate',d.delivery_date,'beforeCarrier',d.carrier_name,'deliveryDate',target_date,'carrierName',c.name,'state',s,'blockers',blockers,'warnings',warnings,
 'counts',jsonb_build_object('deliveries',jsonb_array_length(s->'deliveries'),'orders',(select count(distinct x->>'order_id') from jsonb_array_elements(s->'deliveries') x),'routes',jsonb_array_length(s->'routes'),'settlements',jsonb_array_length(s->'settlements'),'payments',jsonb_array_length(s->'payments')));
end $$;

create or replace function public.correct_dispatch_identity(p_actor uuid,p_dispatch uuid,p_version integer,p_key uuid,p_data jsonb,p_token text,p_sources jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare preview jsonb; before_state jsonb; after_state jsonb; existing logistics_dispatch_corrections; c carriers; p logistics_dispatch_plans;
 request_value jsonb; rid uuid=gen_random_uuid(); result_value jsonb; route_ids uuid[]; delivery_ids uuid[];
begin
 if not can_plan_logistics(p_actor) then raise exception 'Sin permiso para corregir recorridos.' using errcode='42501';end if;
 if p_key is null or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources)>2000 then raise exception 'Solicitud de corrección inválida.';end if;
 request_value=jsonb_build_object('dispatch',p_dispatch,'version',p_version,'data',p_data,'sources',p_sources,'token',p_token);
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into existing from logistics_dispatch_corrections where request_key=p_key;
 if found then
  if existing.actor_id<>p_actor or existing.request<>request_value then raise exception 'La clave de corrección ya se usó para otra solicitud.';end if;
  return existing.result||jsonb_build_object('replayed',true);
 end if;
 perform 1 from logistics_dispatches where id=p_dispatch for update;
 perform 1 from logistics_dispatch_plans where dispatch_id=p_dispatch for update;
 before_state=logistics_correction_state(p_dispatch);
 select coalesce(array_agg((x->>'id')::uuid),'{}') into route_ids from jsonb_array_elements(before_state->'routes') x;
 select coalesce(array_agg((x->>'id')::uuid),'{}') into delivery_ids from jsonb_array_elements(before_state->'deliveries') x;
 perform 1 from route_sheets where id=any(route_ids) order by id for update;
 perform 1 from deliveries where id=any(delivery_ids) order by id for update;
 perform 1 from treasury_settlements where id in(select (x->>'id')::uuid from jsonb_array_elements(before_state->'settlements') x) order by id for update;
 perform 1 from cash_transactions where id in(select (x->>'id')::uuid from jsonb_array_elements(before_state->'payments') x) order by id for update;
 preview=preview_dispatch_correction(p_actor,p_dispatch,p_version,p_data);
 if preview->>'token' is distinct from p_token then raise exception 'Los vínculos cambiaron. Volvé a consultar el impacto.' using errcode='40001';end if;
 if jsonb_array_length(preview->'blockers')>0 then raise exception '%',preview->'blockers'->>0;end if;
 if jsonb_array_length(before_state->'payments')>0 and (p_data->>'acknowledgePayments')::boolean is distinct from true then raise exception 'Confirmá la revisión de los pagos vinculados.';end if;
 select * into c from carriers where id=(p_data->>'carrierId')::uuid;
 select * into p from logistics_dispatch_plans where dispatch_id=p_dispatch;
 update logistics_dispatches set delivery_date=(p_data->>'deliveryDate')::date,carrier_name=c.name,updated_at=now() where id=p_dispatch;
 update logistics_dispatch_plans set carrier_id=c.id,planned=planned||jsonb_build_object('deliveryDate',p_data->>'deliveryDate','carrierId',c.id,'driverName',coalesce(p_data->>'driverName',''),'tariffId',case when p.carrier_id<>c.id or p.planned->>'deliveryDate'<>p_data->>'deliveryDate' then null else planned->'tariffId' end),
 tariff_snapshot=case when p.carrier_id<>c.id or p.planned->>'deliveryDate'<>p_data->>'deliveryDate' then null else tariff_snapshot end,
 estimate=case when p.carrier_id<>c.id or p.planned->>'deliveryDate'<>p_data->>'deliveryDate' then jsonb_build_object('basis',case when planned->>'agreedAmount' is null then 'pending' else 'agreed' end,'amount',planned->'agreedAmount','review',jsonb_build_array('Revisar tarifa luego de corregir el recorrido.')) else estimate end,
 version=version+1,updated_by=p_actor,updated_at=now() where dispatch_id=p_dispatch;
 update route_sheets set delivery_date=(p_data->>'deliveryDate')::date,carrier_id=c.id,updated_at=now() where id=any(route_ids);
 update deliveries set delivery_date=(p_data->>'deliveryDate')::date,carrier_id=c.id,
 real_delivery_date=case when real_delivery_date=(before_state->'dispatch'->>'delivery_date')::date then (p_data->>'deliveryDate')::date else real_delivery_date end,updated_at=now() where id=any(delivery_ids);
 update treasury_settlements set settlement_date=(p_data->>'deliveryDate')::date,carrier_id=c.id,carrier_name=c.name,updated_at=now() where id in(select (x->>'id')::uuid from jsonb_array_elements(before_state->'settlements') x);
 after_state=logistics_correction_state(p_dispatch);
 if before_state->'payments'<>after_state->'payments' then raise exception 'La corrección no debe modificar pagos.';end if;
 result_value=jsonb_build_object('saved',true,'correctionId',rid,'dispatchId',p_dispatch,'version',(after_state->'plan'->>'version')::int);
 insert into logistics_dispatch_corrections(id,request_key,dispatch_id,actor_id,code,delivery_date,carrier_name,reason,request,source_rows,before_value,after_value,result)
 values(rid,p_key,p_dispatch,p_actor,preview->>'code',(p_data->>'deliveryDate')::date,c.name,trim(p_data->>'reason'),request_value,p_sources,before_state,after_state,result_value);
 insert into logistics_dispatch_plan_events(dispatch_id,actor_id,previous_version,data) values(p_dispatch,p_actor,p_version,jsonb_build_object('kind','identity_correction','correctionId',rid,'reason',trim(p_data->>'reason'),'before',before_state,'after',after_state));
 return result_value;
end $$;
revoke all on function public.preview_dispatch_correction(uuid,uuid,integer,jsonb),public.correct_dispatch_identity(uuid,uuid,integer,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_dispatch_correction(uuid,uuid,integer,jsonb),public.correct_dispatch_identity(uuid,uuid,integer,uuid,jsonb,text,jsonb) to service_role;
commit;
