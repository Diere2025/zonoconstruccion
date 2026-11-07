begin;

create or replace function public.link_supplier_financial_movement(
 p_actor uuid,p_key uuid,p_action text,p_payload jsonb,p_target jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 movement public.cash_transactions;
 existing_request public.financial_operation_requests;
 operation_kind text;
 operation_person uuid;
 result jsonb;
 previous_classification jsonb;
begin
 if not public.can_manage_financial_operations(p_actor) then
   raise exception 'No tenés permisos para gestionar Movimientos.' using errcode='42501';
 end if;
 if p_action is distinct from 'link' or p_payload->>'operation_type' is distinct from 'supplier_payment'
   or coalesce(p_payload#>>'{detail,supplier_kind}','registered')<>'registered' or nullif(p_payload->>'supplier_id','') is null
   or p_key is null or nullif(p_target->>'transaction_id','') is null then
   raise exception 'Elegí un egreso existente para vincularlo a un proveedor.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
 select * into existing_request from public.financial_operation_requests where actor_id=p_actor and request_key=p_key;
 if found then
   if existing_request.action<>p_action or existing_request.payload is distinct from
     jsonb_build_object('payload',p_payload,'target',p_target,'reason',p_reason) then
     raise exception 'Clave reutilizada con otros datos.' using errcode='23505';
   end if;
   return existing_request.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict movement from public.cash_transactions where id=(p_target->>'transaction_id')::uuid for update;
 select operation_type,person_id into operation_kind,operation_person from public.financial_operations where id=movement.operation_id;
 if movement.type is distinct from 'egreso' or movement.employee_id is not null or operation_person is not null
   or coalesce(operation_kind,'operating_expense') not in ('general','operating_expense')
   or (movement.operation_id is null and movement.category in ('Proveedores','Sueldos','Impuestos','IIGG','Movimiento de cuentas'))
   or movement.notes like '%TRF-GROUP:%'
   or exists(select 1 from public.supplier_payments where cash_transaction_id=movement.id and reversed_at is null)
   or exists(select 1 from public.client_payments where cash_transaction_id=movement.id and reversed_at is null)
   or exists(select 1 from public.financial_partner_allocations where cash_transaction_id=movement.id and reversed_at is null)
   or exists(select 1 from public.logistics_dispatch_movements where transaction_id=movement.id)
   or exists(select 1 from public.bank_entry_ledger_links l join public.bank_statement_order_links o on o.entry_id=l.entry_id
      where l.cash_transaction_id=movement.id) then
   raise exception 'El egreso ya tiene una imputación o pertenece a otra operación.' using errcode='40001';
 end if;
 if (p_payload->>'account_id')::uuid is distinct from movement.financial_account_id
   or (p_payload->>'payment_method_id')::uuid is distinct from movement.payment_method_id
   or nullif(p_payload->>'cost_center_id','')::uuid is distinct from movement.cost_center_id
   or nullif(p_payload->>'route_sheet_id','')::uuid is distinct from movement.route_sheet_id then
   raise exception 'La vinculación debe conservar las referencias del egreso. Volvé a abrirlo.' using errcode='40001';
 end if;
 result:=public.save_financial_operation(p_actor,p_key,p_action,p_payload,p_target,p_reason);
 if nullif(p_payload->>'financial_concept_id','')::uuid is distinct from movement.financial_concept_id
   or p_payload->>'category' is distinct from movement.category then
   delete from public.financial_classification_snapshots where transaction_id=movement.id returning value into previous_classification;
   if found then
     insert into public.financial_movement_classification_events(transaction_id,before_value,after_value,actor_id)
     values(movement.id,previous_classification,jsonb_build_object('category',p_payload->>'category','concept',p_payload->>'concept'),p_actor);
   end if;
 end if;
 return result;
end;
$$;
revoke all on function public.link_supplier_financial_movement(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.link_supplier_financial_movement(uuid,uuid,text,jsonb,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
