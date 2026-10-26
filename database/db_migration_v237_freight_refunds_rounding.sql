begin;
create table if not exists public.logistics_freight_refunds(
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null unique references public.cash_transactions(id),
 payment_transaction_id uuid not null references public.cash_transactions(id),
 dispatch_id uuid not null references public.logistics_dispatches(id),
 amount numeric(16,2) not null check(amount>0),reason text not null check(length(trim(reason)) between 3 and 500),
 created_by uuid not null,created_at timestamptz not null default now()
);
create index if not exists logistics_freight_refunds_origin on public.logistics_freight_refunds(payment_transaction_id,dispatch_id);
create table if not exists public.logistics_freight_refund_requests(
 actor_id uuid not null,request_key uuid not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_key)
);
alter table public.logistics_freight_refunds enable row level security;
alter table public.logistics_freight_refund_requests enable row level security;
revoke all on public.logistics_freight_refunds,public.logistics_freight_refund_requests from public,anon,authenticated;
grant all on public.logistics_freight_refunds,public.logistics_freight_refund_requests to service_role;

create or replace function public.logistics_freight_paid_amount(p_dispatch uuid) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(coalesce(a.amount,t.amount)) from cash_transactions t
 left join logistics_freight_payment_allocations a on a.transaction_id=t.id and a.dispatch_id=p_dispatch
 where t.type='egreso' and t.currency='ARS' and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
 and (a.dispatch_id is not null or not exists(select 1 from logistics_freight_payment_allocations x where x.transaction_id=t.id) and exists(select 1 from logistics_dispatch_movements l where l.transaction_id=t.id and l.dispatch_id=p_dispatch and l.purpose='freight_fee'))),0)
 -coalesce((select sum(f.amount) from logistics_freight_refunds f join cash_transactions t on t.id=f.transaction_id join cash_transactions p on p.id=f.payment_transaction_id
 where f.dispatch_id=p_dispatch and t.type='ingreso' and t.reversal_of_transaction_id is null and p.reversal_of_transaction_id is null
 and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id in(t.id,p.id))),0)
$$;
revoke all on function public.logistics_freight_paid_amount(uuid) from public,anon,authenticated;
grant execute on function public.logistics_freight_paid_amount(uuid) to service_role;

create or replace function public.refund_logistics_freight(p_actor uuid,p_key uuid,p_dispatch uuid,p_payment uuid,p_version integer,p_expected jsonb,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare original cash_transactions;receipt cash_transactions;request jsonb;previous logistics_freight_refund_requests;
 share numeric;returned numeric;amount numeric;reason text;code text;term_version integer;result jsonb;payload jsonb;
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 if p_key is null then raise exception 'Falta identificar el reintegro';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 request=jsonb_build_object('dispatch',p_dispatch,'payment',p_payment,'version',p_version,'expected',p_expected,'input',p_input);
 select * into previous from logistics_freight_refund_requests where actor_id=p_actor and request_key=p_key;
 if found then if previous.payload is distinct from request then raise exception 'Solicitud reutilizada con otros datos';end if;return previous.result;end if;
 select d.code into code from logistics_dispatches d join logistics_dispatch_plans p on p.dispatch_id=d.id where d.id=p_dispatch and p.status='completed';
 if code is null then raise exception 'Seleccioná un LOG cerrado';end if;
 select version into term_version from logistics_freight_settlement_terms where dispatch_id=p_dispatch;
 if coalesce(term_version,0) is distinct from p_version then raise exception 'El saldo cambió. Volvé a consultar.' using errcode='40001';end if;
 select * into original from cash_transactions where id=p_payment for update;
 if not found or original.type<>'egreso' or original.currency<>'ARS' or original.reversal_of_transaction_id is not null or exists(select 1 from cash_transactions where reversal_of_transaction_id=original.id) then raise exception 'El pago original no está activo';end if;
 if original.amount is distinct from (p_expected->>'amount')::numeric or original.financial_account_id is distinct from (p_expected->>'financial_account_id')::uuid or original.created_at is distinct from (p_expected->>'created_at')::timestamptz then raise exception 'El pago cambió. Volvé a consultar.' using errcode='40001';end if;
 select a.amount into share from logistics_freight_payment_allocations a where a.transaction_id=p_payment and a.dispatch_id=p_dispatch;
 if not found and not exists(select 1 from logistics_freight_payment_allocations where transaction_id=p_payment) and exists(select 1 from logistics_dispatch_movements where transaction_id=p_payment and dispatch_id=p_dispatch and purpose='freight_fee') then share=original.amount;end if;
 if share is null then raise exception 'El pago no está vinculado a este LOG';end if;
 amount=(p_input->>'amount')::numeric;reason=trim(coalesce(p_input->>'reason',''));
 if amount is null or amount<=0 or amount<>round(amount,2) or amount::text in ('NaN','Infinity','-Infinity') or length(reason) not between 3 and 500 then raise exception 'Indicá un importe positivo con hasta dos decimales y el motivo del reintegro';end if;
 select coalesce(sum(f.amount),0) into returned from logistics_freight_refunds f join cash_transactions t on t.id=f.transaction_id where f.payment_transaction_id=p_payment and f.dispatch_id=p_dispatch and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id);
 if amount>share-returned then raise exception 'El reintegro supera lo abonado pendiente de devolver para este LOG';end if;
 payload=jsonb_build_object('operation_type','general','direction','ingreso','effective_date',p_input->>'date','account_id',p_input->>'accountId','payment_method_id',p_input->>'paymentMethodId','amount',amount,'category','Servicio de Flete','sub_category','Reintegro de flete','concept','Reintegro de flete · '||code,'notes',reason||' · Pago original: '||coalesce(original.movement_code,original.id::text)||' · '||code,'detail',jsonb_build_object('reference',code));
 result=save_catalog_financial_operation(p_actor,p_key,'save',payload,'{}','');
 if jsonb_array_length(result->'transaction_ids')<>1 then raise exception 'Se esperaba un único ingreso';end if;
 select * into strict receipt from cash_transactions where id=(result->'transaction_ids'->>0)::uuid;
 if receipt.type<>'ingreso' or receipt.currency<>'ARS' or receipt.amount<>amount then raise exception 'El reintegro debe ingresar pesos en la cuenta seleccionada';end if;
 insert into logistics_freight_refunds(transaction_id,payment_transaction_id,dispatch_id,amount,reason,created_by) values(receipt.id,p_payment,p_dispatch,amount,reason,p_actor);
 insert into logistics_freight_accounting_events(actor_id,dispatch_id,transaction_id,kind,previous_data,new_data) values(p_actor,p_dispatch,receipt.id,'freight_refund',to_jsonb(original),jsonb_build_object('receipt',to_jsonb(receipt),'amount',amount,'reason',reason));
 result=result||jsonb_build_object('movement_code',receipt.movement_code,'refund_amount',amount,'payment_transaction_id',p_payment);
 insert into logistics_freight_refund_requests(actor_id,request_key,payload,result) values(p_actor,p_key,request,result);
 return result;
end $$;
revoke all on function public.refund_logistics_freight(uuid,uuid,uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.refund_logistics_freight(uuid,uuid,uuid,uuid,integer,jsonb,jsonb) to service_role;

create or replace function public.guard_logistics_freight_refund() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  if new.reversal_of_transaction_id is null then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
  if exists(select 1 from logistics_freight_refunds f join cash_transactions t on t.id=f.transaction_id where f.payment_transaction_id=new.reversal_of_transaction_id and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)) then raise exception 'Anulá primero los reintegros vinculados al pago original';end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
  if row(new.amount,new.type,new.currency,new.financial_account_id,new.created_at,new.reversal_of_transaction_id) is distinct from row(old.amount,old.type,old.currency,old.financial_account_id,old.created_at,old.reversal_of_transaction_id)
   and exists(select 1 from logistics_freight_refunds f join cash_transactions t on t.id=f.transaction_id where (f.payment_transaction_id=old.id or f.transaction_id=old.id) and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)) then raise exception 'El movimiento tiene un reintegro vinculado. Conservá sus importes o anulá primero el reintegro.';end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_logistics_freight_refund() from public,anon,authenticated,service_role;
drop trigger if exists logistics_freight_refund_guard on public.cash_transactions;
create trigger logistics_freight_refund_guard before insert or update on public.cash_transactions for each row execute function public.guard_logistics_freight_refund();

-- Current payment/allocation functions, with net refunds and rounding guards, follow.

CREATE OR REPLACE FUNCTION public.pay_logistics_freight(p_actor uuid, p_key uuid, p_payload jsonb, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare previous logistics_freight_payment_requests;request jsonb;result jsonb;tx cash_transactions;alloc jsonb;part jsonb;target uuid;term logistics_freight_settlement_terms;paid numeric;total numeric;owner text;current_owner text; remaining numeric; rounding_rows jsonb:='[]';
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 request=jsonb_build_object('payload',p_payload,'rows',p_rows);
 select * into previous from logistics_freight_payment_requests where actor_id=p_actor and request_key=p_key;
 if found then if previous.payload is distinct from request then raise exception 'Solicitud reutilizada con otros datos';end if;return previous.result;end if;
 if p_payload->>'operation_type'<>'operating_expense' or p_payload->>'direction'<>'egreso' or p_payload->>'category'<>'Servicio de Flete' or nullif(p_payload->>'financial_concept_id','') is not null then raise exception 'Tipo de pago inválido';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 50 or (select count(distinct v->>'code') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception 'Desglose inválido';end if;
 for part in select value from jsonb_array_elements(p_rows) loop
  select p.dispatch_id,coalesce(logistics_company_for_carrier(p.carrier_id),'carrier:'||p.carrier_id::text) into target,current_owner from logistics_dispatch_plans p join logistics_dispatches d on d.id=p.dispatch_id where d.code=part->>'code' and p.status='completed';
  if target is null then raise exception 'La salida no está cerrada';end if;
  if owner is not null and owner<>current_owner then raise exception 'Un pago conjunto debe corresponder al mismo responsable';end if;owner=current_owner;
  select * into term from logistics_freight_settlement_terms where dispatch_id=target;
  if not found or term.version is distinct from (part->>'termsVersion')::integer then raise exception 'Confirmá el valor y las compensaciones de cada LOG antes de pagar' using errcode='40001';end if;
  if term.extra_snapshot is distinct from (select coalesce(actual->'extras','[]') from logistics_dispatch_plans where dispatch_id=target) then raise exception 'Los extras cambiaron: revisar costo';end if;
  paid=logistics_freight_paid_amount(target);
  if term.difference_acceptance is not null and (term.difference_acceptance->>'version')::integer=term.version and (term.difference_acceptance->>'paidAmount')::numeric=paid and (term.difference_acceptance->>'netAmount')::numeric=term.net_amount and (term.difference_acceptance->>'difference')::numeric=paid-term.net_amount then raise exception 'El LOG ya fue liquidado con una diferencia aceptada';end if;
  if (part->>'amount')::numeric<=0 or (part->>'amount')::numeric-(term.net_amount-paid-(case when term.difference_acceptance is not null and (term.difference_acceptance->>'version')::integer<=term.version and paid>=(term.difference_acceptance->>'paidAmount')::numeric and term.net_amount>=(term.difference_acceptance->>'netAmount')::numeric and (term.difference_acceptance->>'difference')::numeric between -500 and -0.01 then -(term.difference_acceptance->>'difference')::numeric else 0 end))>=100 or (part->>'amount')::numeric<>round((part->>'amount')::numeric,2) then raise exception 'El pago supera el saldo o tiene un importe inválido';end if;
  remaining=term.net_amount-paid-(case when term.difference_acceptance is not null and (term.difference_acceptance->>'version')::integer<=term.version and paid>=(term.difference_acceptance->>'paidAmount')::numeric and term.net_amount>=(term.difference_acceptance->>'netAmount')::numeric and (term.difference_acceptance->>'difference')::numeric between -500 and -0.01 then -(term.difference_acceptance->>'difference')::numeric else 0 end);
  if remaining<=0 or (paid>0 and remaining<100) then raise exception 'El LOG ya está saldado';end if;
  if abs((part->>'amount')::numeric-remaining)>0 and abs((part->>'amount')::numeric-remaining)<100 then rounding_rows=rounding_rows||jsonb_build_array(jsonb_build_object('code',part->>'code','expected',remaining,'actual',(part->>'amount')::numeric,'difference',(part->>'amount')::numeric-remaining));end if;
 end loop;
 select sum((v->>'amount')::numeric) into total from jsonb_array_elements(p_rows) v;
 if total is distinct from (p_payload->>'amount')::numeric then raise exception 'El desglose no coincide con el egreso';end if;
 result=save_catalog_financial_operation(p_actor,p_key,'save',p_payload,'{}','');
 if jsonb_array_length(result->'transaction_ids')<>1 then raise exception 'Se esperaba un único movimiento de Caja';end if;
 select * into strict tx from cash_transactions where id=(result->'transaction_ids'->>0)::uuid;
 if tx.currency<>'ARS' or tx.type<>'egreso' or tx.amount<>total then raise exception 'El pago debe estar en pesos';end if;
 alloc=allocate_logistics_freight_payment(p_actor,tx.id,to_jsonb(tx),'[]',p_rows);
 if jsonb_array_length(rounding_rows)>0 then insert into logistics_freight_accounting_events(actor_id,transaction_id,kind,new_data) values(p_actor,tx.id,'payment_rounding',rounding_rows);end if;
 result=result||jsonb_build_object('allocation',alloc,'movement_code',tx.movement_code);
 insert into logistics_freight_payment_requests(actor_id,request_key,payload,result) values(p_actor,p_key,request,result);
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.accept_logistics_freight_difference(p_actor uuid, p_dispatch uuid, p_version integer, p_paid numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare term logistics_freight_settlement_terms; paid numeric; delta numeric; saved logistics_freight_settlement_terms;
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into term from logistics_freight_settlement_terms where dispatch_id=p_dispatch for update;
 if not found or term.version is distinct from p_version then raise exception 'El saldo cambió. Actualizá.' using errcode='40001';end if;
 if not exists(select 1 from logistics_dispatch_plans where dispatch_id=p_dispatch and status='completed' and coalesce(actual->'extras','[]')=term.extra_snapshot) then raise exception 'Confirmá los extras y el servicio cerrado antes de aceptar la diferencia';end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Indicá un motivo de hasta 500 caracteres';end if;
 paid=logistics_freight_paid_amount(p_dispatch);
 delta=paid-term.net_amount;
 if paid is distinct from p_paid then raise exception 'Los pagos cambiaron. Actualizá.' using errcode='40001';end if;
 if paid<=0 or delta=0 or abs(delta)>500 then raise exception 'Sólo se pueden aceptar diferencias de hasta $500 sobre un pago registrado';end if;
 update logistics_freight_settlement_terms set difference_acceptance=jsonb_build_object('version',version+1,'paidAmount',paid,'netAmount',net_amount,'difference',delta,'reason',trim(p_reason),'actor',p_actor,'acceptedAt',now()),version=version+1,updated_at=now() where dispatch_id=p_dispatch returning * into saved;
 insert into logistics_freight_accounting_events(actor_id,dispatch_id,kind,previous_data,new_data) values(p_actor,p_dispatch,'minor_difference_accepted',to_jsonb(term),to_jsonb(saved));
 return to_jsonb(saved);
end$function$;

CREATE OR REPLACE FUNCTION public.allocate_logistics_freight_payment(p_actor uuid, p_transaction uuid, p_expected jsonb, p_previous jsonb, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare tx cash_transactions%rowtype; previous jsonb; r jsonb; total numeric; target uuid;
begin
 if not coalesce(public.can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 if exists(select 1 from logistics_freight_refunds f join cash_transactions t on t.id=f.transaction_id where f.payment_transaction_id=p_transaction and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)) then raise exception 'Anulá primero el reintegro antes de cambiar el desglose del pago';end if;
 select * into tx from cash_transactions where id=p_transaction for update;
 if not found or tx.type<>'egreso' or tx.currency<>'ARS' or tx.amount<=0 or tx.reversal_of_transaction_id is not null
  or not (lower(trim(coalesce(tx.category,'')))='servicio de flete' or lower(trim(coalesce(tx.sub_category,'')))='servicio de flete')
  or exists(select 1 from cash_transactions where reversal_of_transaction_id=tx.id) then raise exception 'Pago de flete inválido o revertido';end if;
 if tx.amount is distinct from (p_expected->>'amount')::numeric or tx.notes is distinct from p_expected->>'notes'
  or tx.concept is distinct from p_expected->>'concept' or tx.created_at is distinct from (p_expected->>'created_at')::timestamptz
  then raise exception 'El movimiento cambió. Volvé a consultarlo.' using errcode='40001';end if;
 select coalesce(jsonb_agg(jsonb_build_object('dispatch_id',dispatch_id,'amount',amount,'reason',reason) order by dispatch_id),'[]') into previous from logistics_freight_payment_allocations where transaction_id=p_transaction;
 if previous is distinct from (select coalesce(jsonb_agg(v order by v->>'dispatch_id'),'[]') from jsonb_array_elements(p_previous) v) then raise exception 'El desglose cambió. Volvé a consultarlo.' using errcode='40001';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 50 then raise exception 'Desglose inválido';end if;
 if (select count(distinct v->>'code') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception 'LOG repetido';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) v where (v->>'amount') is null or (v->>'amount')::numeric<=0 or (v->>'amount')::numeric<>round((v->>'amount')::numeric,2) or length(trim(coalesce(v->>'reason',''))) not between 1 and 500) then raise exception 'Importe o motivo inválidos';end if;
 select sum((v->>'amount')::numeric) into total from jsonb_array_elements(p_rows) v;
 if total is distinct from tx.amount then raise exception 'El desglose debe sumar el pago completo';end if;
 delete from logistics_freight_payment_allocations where transaction_id=p_transaction;
 for r in select value from jsonb_array_elements(p_rows) loop
  select d.id into target from logistics_dispatches d join logistics_dispatch_plans p on p.dispatch_id=d.id where d.code=r->>'code' and p.status='completed';
  if target is null then raise exception 'LOG inexistente o sin cerrar: %',r->>'code';end if;
  insert into logistics_freight_payment_allocations(transaction_id,dispatch_id,amount,reason,confirmed_by) values(p_transaction,target,(r->>'amount')::numeric,r->>'reason',p_actor);
 end loop;
 insert into logistics_freight_accounting_events(actor_id,transaction_id,kind,previous_data,new_data) values(p_actor,p_transaction,'payment_allocation',previous,p_rows);
 return jsonb_build_object('allocated',jsonb_array_length(p_rows),'amount',total);
end;$function$;

revoke all on function public.pay_logistics_freight(uuid,uuid,jsonb,jsonb),public.accept_logistics_freight_difference(uuid,uuid,integer,numeric,text),public.allocate_logistics_freight_payment(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pay_logistics_freight(uuid,uuid,jsonb,jsonb),public.accept_logistics_freight_difference(uuid,uuid,integer,numeric,text),public.allocate_logistics_freight_payment(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
