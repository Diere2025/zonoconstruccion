begin;
create or replace function public.guard_supplier_credit_scope() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- supplier credit scope serialization v248: account cutovers share the same
 -- boundary as credit/payment posting, even when no credit was visible yet.
 if tg_table_name in ('supplier_account_starts','supplier_account_history') then
  perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 end if;
 if exists(select 1 from supplier_credit_allocations a join supplier_purchases c on c.id=a.credit_id
  where c.supplier_id=coalesce(new.supplier_id,old.supplier_id)
   and (not supplier_document_in_account(a.credit_id) or not supplier_document_in_account(a.purchase_id))) then
  raise exception 'Liberá las aplicaciones de crédito antes de excluir sus documentos o cambiar el punto de partida.';
 end if;
 return null;
end $$;
commit;
