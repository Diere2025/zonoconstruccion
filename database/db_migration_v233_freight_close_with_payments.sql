begin;
-- INC-005182: closing a trip must preserve prior payments and hand its balance
-- to Treasury. Creating another payment is a separate, guarded operation.
create or replace function public.save_logistics_plan_with_payment_task(p_actor uuid,p_payload jsonb,p_floor bigint,p_fee jsonb,p_summary text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;version_now integer;task jsonb;dispatch uuid;ticket uuid;
begin
 result=public.save_logistics_dispatch_plan(p_actor,p_payload,p_floor);
 dispatch=(result->>'dispatchId')::uuid;
 select version into version_now from logistics_dispatch_plans where dispatch_id=dispatch for update;
 select support_ticket_id into ticket from logistics_dispatch_liquidations where dispatch_id=dispatch;
 if ticket is not null then
  return result||jsonb_build_object('ticketId',ticket,'reviewExistingPayments',true);
 end if;
 if exists(
  select 1 from cash_transactions t where t.type='egreso' and t.currency='ARS' and t.amount>0
   and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
   and (exists(select 1 from logistics_dispatch_movements l where l.transaction_id=t.id and l.dispatch_id=dispatch
    and (l.purpose='freight_fee' or lower(trim(t.category))='servicio de flete' or lower(trim(t.sub_category))='servicio de flete'))
    or exists(select 1 from logistics_freight_payment_allocations a where a.transaction_id=t.id and a.dispatch_id=dispatch))
 ) then
  task=public.ensure_logistics_review_task(p_actor,dispatch);
  return result||jsonb_build_object('ticketId',task->>'id','amountPending',true,'reviewExistingPayments',true);
 end if;
 task=public.confirm_logistics_payment_task(p_actor,dispatch,version_now,p_fee,p_summary);
 return result||task;
end$$;
revoke all on function public.save_logistics_plan_with_payment_task(uuid,jsonb,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_logistics_plan_with_payment_task(uuid,jsonb,bigint,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
