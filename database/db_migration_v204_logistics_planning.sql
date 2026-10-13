begin;
create table if not exists public.logistics_carrier_tariffs (
 id uuid primary key default gen_random_uuid(), label text not null,
 carrier_id uuid references public.carriers(id), company_key text,
 zone_variant text not null check(zone_variant in ('regular','la_plata','lp_zarate')),
 effective_from date not null, effective_to date, active boolean not null default true,
 terms jsonb not null, source_key text unique, created_by uuid not null,
 created_at timestamptz not null default now(), check(effective_to is null or effective_to>=effective_from),
 check(carrier_id is not null or company_key is not null)
);
create table if not exists public.logistics_dispatch_plans (
 dispatch_id uuid primary key references public.logistics_dispatches(id),
 request_key uuid not null unique, carrier_id uuid not null references public.carriers(id),
 status text not null default 'planned' check(status in ('planned','in_progress','completed','cancelled')),
 planned jsonb not null, actual jsonb not null default '{}', tariff_snapshot jsonb, estimate jsonb not null default '{}',
 version integer not null default 1, created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.logistics_dispatch_plan_events (
 id uuid primary key default gen_random_uuid(), dispatch_id uuid not null references public.logistics_dispatches(id),
 actor_id uuid not null, previous_version integer, data jsonb not null, created_at timestamptz not null default now()
);
alter table public.logistics_carrier_tariffs enable row level security;
alter table public.logistics_dispatch_plans enable row level security;
alter table public.logistics_dispatch_plan_events enable row level security;
revoke all on public.logistics_carrier_tariffs, public.logistics_dispatch_plans, public.logistics_dispatch_plan_events from anon,authenticated;
grant all on public.logistics_carrier_tariffs, public.logistics_dispatch_plans, public.logistics_dispatch_plan_events to service_role;
create or replace function public.can_plan_logistics(p_actor uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.is_treasury_settlement_admin(p_actor) or exists(select 1 from auth.users u join sellers s on s.id=u.id or lower(s.email)=lower(u.email) where u.id=p_actor and s.is_active is not false and ('logistica'=s.role or 'logistica'=any(coalesce(s.roles,'{}'))));
$$;
create or replace function public.save_logistics_dispatch_plan(p_actor uuid,p_payload jsonb,p_floor bigint default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_row logistics_dispatch_plans%rowtype;v_dispatch logistics_dispatches%rowtype;
 v_carrier carriers%rowtype;v_code text;v_n bigint;v_plan jsonb=p_payload->'planned';v_status text=p_payload->>'status';v_request uuid;
begin
 if not can_plan_logistics(p_actor) then raise exception 'Sin permiso para planificar logística' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 if not(v_status=any(array['planned','in_progress','completed','cancelled'])) or v_status is null then raise exception 'Estado inválido';end if;
 if jsonb_typeof(v_plan->'loads')<>'array' or jsonb_array_length(v_plan->'loads') not between 1 and 8 then raise exception 'Cargas inválidas';end if;
 select * into v_carrier from carriers where id=(v_plan->>'carrierId')::uuid and is_active is not false;
 if not found then raise exception 'Fletero inválido';end if;
 if p_payload->>'dispatchId' is not null then
  v_id=(p_payload->>'dispatchId')::uuid;
  select * into v_row from logistics_dispatch_plans where dispatch_id=v_id for update;
  if not found then raise exception 'Plan no encontrado';end if;
  if v_row.version is distinct from (p_payload->>'version')::integer then raise exception 'Otra persona modificó esta salida. Actualizá antes de guardar.' using errcode='40001';end if;
  if v_row.status in ('completed','cancelled') then raise exception 'La salida ya está cerrada';end if;
  select * into v_dispatch from logistics_dispatches where id=v_id for update;
  if v_row.carrier_id<>v_carrier.id or v_dispatch.delivery_date<>(v_plan->>'deliveryDate')::date then raise exception 'Fecha y fletero del LOG no se cambian. Cancelá y creá otra salida.';end if;
  if v_status='planned' and v_row.status='in_progress' then raise exception 'No se puede volver a planificación después de salir';end if;
 else
  v_request=(p_payload->>'requestKey')::uuid;
  select * into v_row from logistics_dispatch_plans where request_key=v_request;
  if found then return jsonb_build_object('dispatchId',v_row.dispatch_id,'replayed',true);end if;
  if v_status<>'planned' then raise exception 'La salida se crea planificada';end if;
  v_code=nullif(p_payload->>'sourceCode','');
  if v_code is null then
   select greatest(coalesce(max(substring(code from '^LOG_REC_([0-9]+)')::bigint),0),p_floor,0)+1 into v_n from logistics_dispatches;
   v_code='LOG_REC_'||lpad(v_n::text,greatest(5,length(v_n::text)),'0');
   insert into logistics_dispatches(code,delivery_date,carrier_name,data) values(v_code,(v_plan->>'deliveryDate')::date,v_carrier.name,jsonb_build_object('origin','erp_planning')) returning id into v_id;
  else
   select * into v_dispatch from logistics_dispatches where code=v_code for update;
   if found then
    if v_dispatch.delivery_date<>(v_plan->>'deliveryDate')::date then raise exception 'Fecha del LOG en conflicto';end if;
    if exists(select 1 from logistics_dispatch_plans where dispatch_id=v_dispatch.id) then raise exception 'Este LOG ya está cargado en planificación';end if;
    v_id=v_dispatch.id;
   else
    insert into logistics_dispatches(code,delivery_date,carrier_name,data) values(v_code,(v_plan->>'deliveryDate')::date,v_carrier.name,jsonb_build_object('origin','erp_planning','importedTracking',true)) returning id into v_id;
   end if;
  end if;
  insert into logistics_dispatch_plans(dispatch_id,request_key,carrier_id,planned,created_by,updated_by) values(v_id,v_request,v_carrier.id,v_plan,p_actor,p_actor);
  select * into v_row from logistics_dispatch_plans where dispatch_id=v_id;
 end if;
 if v_status='completed' and (p_payload->'actual'->>'km' is null or exists(select 1 from jsonb_array_elements(v_plan->'loads') l where not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'actual'->'loads','[]'::jsonb)) a where a->>'runNumber'=l->>'runNumber' and nullif(a->>'departure','') is not null and nullif(a->>'arrival','') is not null))) then raise exception 'Faltan datos realizados por carga';end if;
 if v_status='cancelled' and coalesce(v_plan->>'notes','')='' then raise exception 'Indicá el motivo de cancelación';end if;
 if v_status='cancelled' and (exists(select 1 from logistics_dispatch_attempts where dispatch_id=v_id and executed) or exists(select 1 from logistics_dispatch_settlements where dispatch_id=v_id) or exists(select 1 from logistics_dispatch_movements where dispatch_id=v_id)) then raise exception 'Este LOG ya tiene pedidos ejecutados, rendiciones o pagos; no puede marcarse como no salido.';end if;
 update logistics_dispatch_plans set planned=v_plan,actual=p_payload->'actual',status=v_status,tariff_snapshot=p_payload->'tariffSnapshot',estimate=p_payload->'estimate',version=case when p_payload->>'dispatchId' is null then 1 else version+1 end,updated_by=p_actor,updated_at=now() where dispatch_id=v_id returning * into v_row;
 insert into logistics_dispatch_plan_events(dispatch_id,actor_id,previous_version,data) values(v_id,p_actor,case when v_row.version=1 then null else v_row.version-1 end,to_jsonb(v_row)||jsonb_build_object('legacy',p_payload->'legacy'));
 return jsonb_build_object('dispatchId',v_id,'version',v_row.version);
end;
$$;
revoke all on function public.can_plan_logistics(uuid),public.save_logistics_dispatch_plan(uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.can_plan_logistics(uuid),public.save_logistics_dispatch_plan(uuid,jsonb,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
