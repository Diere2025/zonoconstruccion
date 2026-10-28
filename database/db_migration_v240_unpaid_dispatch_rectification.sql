begin;
-- INC-005237: invalidate an unpaid logistics approval; treasury terms and posted payments remain protected.
alter table public.logistics_dispatch_reopenings add column if not exists rectified_snapshot jsonb;
alter table public.logistics_dispatch_reopenings add column if not exists rectified_at timestamptz;
alter table public.logistics_dispatch_reopenings add column if not exists rectified_by uuid;
alter table public.logistics_dispatch_reopenings add column if not exists rectified_actor_name text;
-- Recover the first subsequent closing for reaperturas recorded before this migration.
with closed as (
 select distinct on (r.id) r.id,e.data,e.created_at,e.actor_id,s.full_name
 from public.logistics_dispatch_reopenings r
 join public.logistics_dispatch_plan_events e on e.dispatch_id=r.dispatch_id
  and e.previous_version >= (r.result->>'version')::integer and e.data->>'status'='completed'
 left join public.sellers s on s.id=e.actor_id
 where r.rectified_at is null order by r.id,e.previous_version,e.created_at,e.id
)
update public.logistics_dispatch_reopenings r set rectified_snapshot=c.data,rectified_at=c.created_at,
 rectified_by=c.actor_id,rectified_actor_name=coalesce(c.full_name,c.actor_id::text)
from closed c where r.id=c.id;
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
 if exists(select 1 from public.logistics_freight_settlement_terms where dispatch_id=p_dispatch) then
  blockers:=blockers||jsonb_build_array('Tesorería ya confirmó el saldo o las compensaciones del LOG. Revisá el ajuste desde Saldo / desglose con Tesorería.');end if;
 if exists(
  select 1 from public.cash_transactions t where t.id in (
   select l.transaction_id from public.logistics_dispatch_movements l where l.dispatch_id=p_dispatch and (l.purpose='freight_fee' or lower(trim(t.category))='servicio de flete' or lower(trim(t.sub_category))='servicio de flete')
   union select a.transaction_id from public.logistics_freight_payment_allocations a where a.dispatch_id=p_dispatch)
  and t.type='egreso' and t.amount>0 and t.reversal_of_transaction_id is null
  and not exists(select 1 from public.cash_transactions r where r.reversal_of_transaction_id=t.id)
 ) then blockers:=blockers||jsonb_build_array('Hay pagos de flete vinculados. Tesorería debe revisar el ajuste conservando esos movimientos.');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'created_at',h.created_at,'actor_name',coalesce(nullif(h.actor_name,''),h.full_name,'Usuario registrado'),'reason',h.reason,'previous_status',h.before_snapshot->>'status','status',h.after_snapshot->>'status','kmBefore',h.before_snapshot->'actual'->'km','kmAfter',h.rectified_snapshot->'actual'->'km','rectifiedAt',h.rectified_at,'rectifiedBy',h.rectified_actor_name,'previousLiquidation',h.before_snapshot->'invalidatedLiquidation'->'total') order by h.created_at desc,h.id),'[]') into history
 from (select r.*,s.full_name from public.logistics_dispatch_reopenings r left join public.sellers s on s.id=r.actor_id where r.dispatch_id=p_dispatch order by r.created_at desc,r.id limit 20) h;
 return jsonb_build_object('dispatchId',p_dispatch,'code',d.code,'status',p.status,'version',p.version,'canReopen',public.can_plan_logistics(p_actor) and jsonb_array_length(blockers)=0,'blockers',blockers,'history',history,'resetsLiquidation',exists(select 1 from public.logistics_dispatch_liquidations where dispatch_id=p_dispatch),'approvedAmount',(select total from public.logistics_dispatch_liquidations where dispatch_id=p_dispatch));
end;$$;

create or replace function public.reopen_logistics_dispatch(p_actor uuid,p_dispatch uuid,p_version integer,p_key uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.logistics_dispatch_plans%rowtype;previous jsonb;following jsonb;state jsonb;r public.logistics_dispatch_reopenings%rowtype;reason text:=trim(coalesce(p_reason,''));req jsonb;result jsonb;event_id uuid:=gen_random_uuid();v_actor_name text;approved public.logistics_dispatch_liquidations%rowtype;
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
 select * into approved from public.logistics_dispatch_liquidations where dispatch_id=p_dispatch for update;
 previous:=to_jsonb(p)||jsonb_build_object('invalidatedLiquidation',case when approved.dispatch_id is not null then to_jsonb(approved) else null end);
 if approved.dispatch_id is not null then
  -- Reuse the same review ticket when the corrected LOG is closed again.
  if exists(select 1 from public.logistics_dispatch_review_tasks where dispatch_id=p_dispatch and support_ticket_id<>approved.support_ticket_id) then raise exception 'La tarea de revisión del LOG es inconsistente. Revisar con Administración.';end if;
  insert into public.logistics_dispatch_review_tasks(dispatch_id,support_ticket_id,created_by)
   values(p_dispatch,approved.support_ticket_id,p_actor) on conflict(dispatch_id) do nothing;
  delete from public.logistics_dispatch_liquidations where dispatch_id=p_dispatch;
 end if;
 update public.logistics_dispatch_plans set status='in_progress',version=version+1,updated_by=p_actor,updated_at=clock_timestamp() where dispatch_id=p_dispatch returning * into p;
 following:=to_jsonb(p);
 result:=jsonb_build_object('dispatchId',p_dispatch,'version',p_version+1,'status','in_progress','reopeningId',event_id);
 insert into public.logistics_dispatch_reopenings(id,dispatch_id,actor_id,actor_name,reason,request_key,request,before_snapshot,after_snapshot,result) values(event_id,p_dispatch,p_actor,v_actor_name,reason,p_key,req,previous,following,result);
 insert into public.logistics_dispatch_plan_events(dispatch_id,actor_id,previous_version,data) values(p_dispatch,p_actor,p_version,following||jsonb_build_object('operation','reopen','reason',reason,'reopeningId',event_id));
 return result;
end;$$;
revoke all on function public.logistics_dispatch_reopening_state(uuid,uuid),public.reopen_logistics_dispatch(uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.logistics_dispatch_reopening_state(uuid,uuid),public.reopen_logistics_dispatch(uuid,uuid,integer,uuid,text) to service_role;
-- Capture the first subsequent closing, including corrections saved in intermediate steps.
create or replace function public.record_logistics_reopening_rectification() returns trigger
language plpgsql security definer set search_path='' as $$
declare author text;reopening uuid;
begin
 if old.status='in_progress' and new.status='completed' then
  select id into reopening from public.logistics_dispatch_reopenings where dispatch_id=new.dispatch_id and rectified_at is null
   and (result->>'version')::integer<=old.version order by created_at desc,id desc limit 1;
  if reopening is not null then
   select s.full_name into author from public.sellers s where s.id=new.updated_by or exists(select 1 from auth.users u where u.id=new.updated_by and lower(u.email)=lower(s.email)) order by (s.id=new.updated_by) desc,s.id limit 1;
   update public.logistics_dispatch_reopenings set rectified_snapshot=to_jsonb(new),rectified_at=clock_timestamp(),rectified_by=new.updated_by,rectified_actor_name=coalesce(author,new.updated_by::text) where id=reopening;
  end if;
 end if;
 return new;
end;$$;
drop trigger if exists logistics_reopening_rectification on public.logistics_dispatch_plans;
create trigger logistics_reopening_rectification after update on public.logistics_dispatch_plans for each row execute function public.record_logistics_reopening_rectification();
revoke all on function public.record_logistics_reopening_rectification() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
