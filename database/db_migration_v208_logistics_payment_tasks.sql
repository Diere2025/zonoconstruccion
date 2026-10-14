begin;
create table if not exists public.logistics_dispatch_liquidations (
 dispatch_id uuid primary key references public.logistics_dispatch_plans(dispatch_id),
 total numeric(16,2) not null check(total>0 and total<=100000000),
 fee jsonb not null, support_ticket_id uuid not null unique references public.support_tickets(id),
 approved_by uuid not null, approved_at timestamptz not null default now()
);
alter table public.logistics_dispatch_liquidations enable row level security;
revoke all on public.logistics_dispatch_liquidations from anon,authenticated;
grant all on public.logistics_dispatch_liquidations to service_role;
create or replace function public.confirm_logistics_payment_task(p_actor uuid,p_dispatch uuid,p_version integer,p_fee jsonb,p_summary text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare plan logistics_dispatch_plans%rowtype; old logistics_dispatch_liquidations%rowtype;
 recipient uuid; sector uuid; result jsonb; previous_claim text; code text; computed numeric;
begin
 if not public.can_plan_logistics(p_actor) then raise exception 'Sin permiso para confirmar logística' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into plan from logistics_dispatch_plans where dispatch_id=p_dispatch for update;
 if not found or plan.status<>'completed' or coalesce((plan.planned->>'historicalImport')::boolean,false) then raise exception 'La tarea requiere una salida del ERP cerrada';end if;
 if plan.version is distinct from p_version then raise exception 'La salida cambió. Actualizá.' using errcode='40001';end if;
 computed=(p_fee->>'base')::numeric+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(coalesce(p_fee->'additions','[]'::jsonb)) a),0);
 if p_fee->>'status' is distinct from 'ready' or (p_fee->>'total')::numeric is distinct from computed or computed<=0 or computed>100000000 or length(p_summary)<10 then raise exception 'Importe o resumen inválido';end if;
 select * into old from logistics_dispatch_liquidations where dispatch_id=p_dispatch;
 if found then
  if old.total is distinct from computed or (old.fee-'approvedAt'-'dispatchId'-'version') is distinct from (p_fee-'approvedAt'-'dispatchId'-'version') then raise exception 'Ya existe un importe confirmado para esta salida';end if;
  return jsonb_build_object('ticketId',old.support_ticket_id,'replayed',true);
 end if;
 if exists(select 1 from logistics_dispatch_movements l join cash_transactions t on t.id=l.transaction_id where l.dispatch_id=p_dispatch and t.type='egreso' and t.currency='ARS' and t.amount>0 and t.reversal_of_transaction_id is null
  and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
  and (l.purpose='freight_fee' or lower(trim(t.category))='servicio de flete' or lower(trim(t.sub_category))='servicio de flete')) then raise exception 'La salida ya tiene pagos: revisar su liquidación antes de crear otra tarea';end if;
 if (select count(*) from support_profiles p join sellers s on s.id=p.seller_id where lower(trim(s.full_name))='laura guerra' and s.is_active is not false)<>1 then raise exception 'Configurar una responsable Laura Guerra inequívoca';end if;
 select p.user_id into recipient from support_profiles p join sellers s on s.id=p.seller_id where lower(trim(s.full_name))='laura guerra' and s.is_active is not false;
 select a.id into sector from support_sectors a join support_sector_members m on m.sector_id=a.id where a.active and m.active and m.user_id=recipient and a.name='Tesorería y Finanzas';
 if recipient is null or sector is null then raise exception 'Configurar a Laura como responsable activa de Tesorería';end if;
 select d.code into code from logistics_dispatches d where d.id=p_dispatch;
 previous_claim=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 result=public.support_command('create',null,gen_random_uuid(),null,jsonb_build_object('responsibility_kind','person','assignee_id',recipient,'sector_id',sector,
  'title','Revisar y pagar flete · '||code,'description',p_summary,'module','Logística / pago de flete','type','request','suggested_priority','medium',
  'expected','Revisar el importe confirmado, registrar el pago en Movimientos y vincularlo al LOG '||code||'.'));
 perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
 insert into logistics_dispatch_liquidations(dispatch_id,total,fee,support_ticket_id,approved_by) values(p_dispatch,computed,p_fee,(result->>'id')::uuid,p_actor);
 return jsonb_build_object('ticketId',result->>'id','replayed',false);
end;
$$;
revoke all on function public.confirm_logistics_payment_task(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.confirm_logistics_payment_task(uuid,uuid,integer,jsonb,text) to service_role;
-- Save the operational closing and its approved task in one transaction.
create or replace function public.save_logistics_plan_with_payment_task(p_actor uuid,p_payload jsonb,p_floor bigint,p_fee jsonb,p_summary text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; version_now integer; task jsonb;
begin
 result=public.save_logistics_dispatch_plan(p_actor,p_payload,p_floor);
 select version into version_now from logistics_dispatch_plans where dispatch_id=(result->>'dispatchId')::uuid;
 task=public.confirm_logistics_payment_task(p_actor,(result->>'dispatchId')::uuid,version_now,p_fee,p_summary);
 return result||task;
end;
$$;
revoke all on function public.save_logistics_plan_with_payment_task(uuid,jsonb,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_logistics_plan_with_payment_task(uuid,jsonb,bigint,jsonb,text) to service_role;
commit;
