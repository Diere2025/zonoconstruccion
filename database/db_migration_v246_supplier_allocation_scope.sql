begin;
create function public.supplier_document_in_account(p_purchase uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from supplier_account_entries e join supplier_account_starts s on s.supplier_id=e.supplier_id
  left join supplier_account_history h on h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id
  where e.source='purchase' and e.source_id=p_purchase and not e.voided and coalesce(h.included,e.entry_date>=s.start_date))
$$;
create view public.supplier_document_account_scope as
 select id,public.supplier_document_in_account(id) account_included from public.supplier_purchases;
revoke all on public.supplier_document_account_scope from public,anon,authenticated;
grant select on public.supplier_document_account_scope to service_role;
revoke all on function public.supplier_document_in_account(uuid) from public,anon,authenticated;
grant execute on function public.supplier_document_in_account(uuid) to service_role;
do $migration$
declare definition text; fifo_anchor text:='and document_type is distinct from ''Nota de Crédito'' and total_amount>0';
 explicit_anchor text:='or v_purchase.document_type=''Nota de Crédito''';
begin
 select pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
 if position('supplier account scope v246' in definition)>0 then return; end if;
 if (length(definition)-length(replace(definition,fifo_anchor,'')))/length(fifo_anchor)<>2 or position(explicit_anchor in definition)=0 then
  raise exception 'El núcleo financiero cambió: revisar los límites de cuenta corriente antes de instalar.';
 end if;
 definition:=replace(definition,fifo_anchor,fifo_anchor||' and public.supplier_document_in_account(supplier_purchases.id)');
 definition:=replace(definition,explicit_anchor,'or not public.supplier_document_in_account(v_purchase.id) '||explicit_anchor);
 definition:=replace(definition,'-- supplier FIFO allocation v149','-- supplier account scope v246'||chr(10)||'     -- supplier FIFO allocation v149');
 execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
