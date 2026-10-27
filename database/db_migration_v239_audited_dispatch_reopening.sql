begin;
create table if not exists public.logistics_dispatch_reopenings (
 id uuid primary key default gen_random_uuid(),dispatch_id uuid not null references public.logistics_dispatches(id),
 actor_id uuid not null,actor_name text not null default '',reason text not null check(length(trim(reason)) between 20 and 2000),
 created_at timestamptz not null default clock_timestamp(),request_key uuid not null unique,request jsonb not null,
 before_snapshot jsonb not null,after_snapshot jsonb not null,result jsonb not null
);
alter table public.logistics_dispatch_reopenings drop constraint if exists logistics_dispatch_reopenings_actor_id_fkey;
alter table public.logistics_dispatch_reopenings add column if not exists actor_name text not null default '';
create index if not exists logistics_dispatch_reopenings_history on public.logistics_dispatch_reopenings(dispatch_id,created_at desc);
alter table public.logistics_dispatch_reopenings enable row level security;
revoke all on public.logistics_dispatch_reopenings from public,anon,authenticated;
grant select,insert on public.logistics_dispatch_reopenings to service_role;

create or replace function public.logistics_dispatch_reopening_state(p_actor uuid,p_dispatch uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.logistics_dispatch_plans%rowtype;d public.logistics_dispatches%rowtype; blockers jsonb:='[]';history jsonb;
begin
 if public.can_plan_logistics(p_actor) is not true and public.can_manage_financial_operations(p_actor) is not true then raise exception 'Sin permiso para consultar la reapertura' using errcode='42501';end if;
 select * into p from public.logistics_dispatch_plans where dispatch_id=p_dispatch;
 select * into d from public.logistics_dispatches where id=p_dispatch;
 if p.dispatch_id is null or d.id is null then raise exception 'LOG no encontrado';end if;
 if p.status<>'completed' then blockers:=blockers||jsonb_build_array('Solo se pueden reabrir salidas cerradas.');end if;
 if coalesce((p.planned->>'historicalImport')::boolean,false) then blockers:=blockers||jsonb_build_array('Esta salida histórica importada se revisa mediante el circuito de correcciones.');end if;
 if exists(select 1 from public.logistics_dispatch_liquidations where dispatch_id=p_dispatch) or exists(select 1 from public.logistics_freight_settlement_terms where dispatch_id=p_dispatch) then
  blockers:=blockers||jsonb_build_array('El LOG ya tiene un importe de liquidación confirmado. Revisá el ajuste desde Saldo / desglose con Tesorería.');end if;
 if exists(
  select 1 from public.cash_transactions t where t.id in (
   select l.transaction_id from public.logistics_dispatch_movements l where l.dispatch_id=p_dispatch and (l.purpose='freight_fee' or lower(trim(t.category))='servicio de flete' or lower(trim(t.sub_category))='servicio de flete')
   union select a.transaction_id from public.logistics_freight_payment_allocations a where a.dispatch_id=p_dispatch)
  and t.type='egreso' and t.amount>0 and t.reversal_of_transaction_id is null
  and not exists(select 1 from public.cash_transactions r where r.reversal_of_transaction_id=t.id)
 ) then blockers:=blockers||jsonb_build_array('Hay pagos de flete vinculados. Tesorería debe revisar el ajuste conservando esos movimientos.');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'created_at',h.created_at,'actor_name',coalesce(nullif(h.actor_name,''),h.full_name,'Usuario registrado'),'reason',h.reason,'previous_status',h.before_snapshot->>'status','status',h.after_snapshot->>'status') order by h.created_at desc,h.id),'[]') into history
 from (select r.*,s.full_name from public.logistics_dispatch_reopenings r left join public.sellers s on s.id=r.actor_id where r.dispatch_id=p_dispatch order by r.created_at desc,r.id limit 20) h;
 return jsonb_build_object('dispatchId',p_dispatch,'code',d.code,'status',p.status,'version',p.version,'canReopen',public.can_plan_logistics(p_actor) and jsonb_array_length(blockers)=0,'blockers',blockers,'history',history);
end;$$;

create or replace function public.reopen_logistics_dispatch(p_actor uuid,p_dispatch uuid,p_version integer,p_key uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.logistics_dispatch_plans%rowtype;previous jsonb;following jsonb;state jsonb;r public.logistics_dispatch_reopenings%rowtype;reason text:=trim(coalesce(p_reason,''));req jsonb;result jsonb;event_id uuid:=gen_random_uuid();v_actor_name text;
begin
 if public.can_plan_logistics(p_actor) is not true then raise exception 'Sin permiso para reabrir logística' using errcode='42501';end if;
 if p_key is null or p_version is null or p_version<1 or length(reason) not between 20 and 2000 or (select count(*) from regexp_matches(reason,'[[:alpha:]]{2,}','g'))<4 then raise exception 'Justificá qué se cerró mal, qué vas a corregir y por qué corresponde reabrir (20 a 2000 caracteres).';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 req:=jsonb_build_object('actor',p_actor,'dispatch',p_dispatch,'version',p_version,'reason',reason);
 select * into r from public.logistics_dispatch_reopenings where request_key=p_key;
 if found then if r.request<>req then raise exception 'La clave de reapertura ya fue utilizada con otros datos' using errcode='40001';end if;return r.result;end if;
 select * into p from public.logistics_dispatch_plans where dispatch_id=p_dispatch for update;
 if not found then raise exception 'LOG no encontrado';end if;
 if p.version is distinct from p_version then raise exception 'Otra persona modificó la salida. Actualizá antes de reabrir.' using errcode='40001';end if;
 state:=public.logistics_dispatch_reopening_state(p_actor,p_dispatch);
 if not (state->>'canReopen')::boolean then raise exception '%',state->'blockers'->>0;end if;
 select s.full_name into v_actor_name from public.sellers s where s.id=p_actor or exists(select 1 from auth.users u where u.id=p_actor and lower(u.email)=lower(s.email)) order by (s.id=p_actor) desc,s.id limit 1;
 v_actor_name:=coalesce(v_actor_name,p_actor::text);
 previous:=to_jsonb(p);
 update public.logistics_dispatch_plans set status='in_progress',version=version+1,updated_by=p_actor,updated_at=clock_timestamp() where dispatch_id=p_dispatch returning * into p;
 following:=to_jsonb(p);
 result:=jsonb_build_object('dispatchId',p_dispatch,'version',p_version+1,'status','in_progress','reopeningId',event_id);
 insert into public.logistics_dispatch_reopenings(id,dispatch_id,actor_id,actor_name,reason,request_key,request,before_snapshot,after_snapshot,result) values(event_id,p_dispatch,p_actor,v_actor_name,reason,p_key,req,previous,following,result);
 insert into public.logistics_dispatch_plan_events(dispatch_id,actor_id,previous_version,data) values(p_dispatch,p_actor,p_version,following||jsonb_build_object('operation','reopen','reason',reason,'reopeningId',event_id));
 return result;
end;$$;
revoke all on function public.logistics_dispatch_reopening_state(uuid,uuid),public.reopen_logistics_dispatch(uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.logistics_dispatch_reopening_state(uuid,uuid),public.reopen_logistics_dispatch(uuid,uuid,integer,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
