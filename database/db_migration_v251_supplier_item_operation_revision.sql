begin;
create function public.supplier_item_operation_revision() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- A financial editor opened before a detailed redistribution must reload.
 -- This changes only its optimistic version, never the payment or cash rows.
 if new.payment_id is not null then
  update financial_operations set version=version+1,updated_at=clock_timestamp()
   where id in(select t.operation_id from supplier_payments p join cash_transactions t on t.id=p.cash_transaction_id where p.id=new.payment_id);
 end if;
 return null;
end $$;
create trigger supplier_item_operation_revision after insert on public.supplier_payable_application_events
for each row execute function public.supplier_item_operation_revision();
revoke all on function public.supplier_item_operation_revision(),public.supplier_part_structure_revision(),public.supplier_part_event_revision(),public.supplier_part_scope_revision(),public.guard_supplier_credit_document(),public.refresh_supplier_credit_target(),public.guard_supplier_credit_scope() from public,anon,authenticated;
grant execute on function public.supplier_item_operation_revision(),public.supplier_part_structure_revision(),public.supplier_part_event_revision(),public.supplier_part_scope_revision(),public.guard_supplier_credit_document(),public.refresh_supplier_credit_target(),public.guard_supplier_credit_scope() to service_role;
commit;
