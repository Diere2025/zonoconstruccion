begin;
-- Keep authorization, FIFO readiness and posting within one database round trip.
-- The core still validates every FK, balances, versions and idempotency key.
create or replace function public.save_financial_operation(
 p_actor uuid,p_key uuid,p_action text,p_payload jsonb,p_target jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.can_manage_financial_operations(p_actor) then
   raise exception 'No tenés permisos para gestionar Movimientos.' using errcode='42501';
 end if;
 if p_action not in ('save','link') or p_action is null then
   raise exception 'Solicitud de guardado inválida.';
 end if;
 if p_payload->>'operation_type'='supplier_payment'
   and p_payload#>>'{detail,supplier_allocation_mode}'='oldest_first'
   and not public.supplier_payment_fifo_available() then
   raise exception 'El pago automático a cuenta corriente todavía no está habilitado.';
 end if;
 return public.mutate_financial_operation(p_actor,p_key,p_action,p_payload,p_target,p_reason);
end;
$$;
revoke all on function public.save_financial_operation(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_financial_operation(uuid,uuid,text,jsonb,jsonb,text) to service_role;
commit;
