begin;
-- Compare monetary values in cents, including imported totals with float residue.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
 if position('supplier cents v162' in definition)>0 then return; end if;
 if position('doc.total_amount-coalesce(sum(a.amount),0)' in definition)=0
    or position('v_purchase.total_amount-v_paid' in definition)=0 then
   raise exception 'El núcleo financiero cambió; revisar la corrección de centavos.';
 end if;
 definition:=replace(definition,'doc.total_amount-coalesce(sum(a.amount),0)','round(doc.total_amount,2)-coalesce(sum(a.amount),0)');
 definition:=replace(definition,'v_purchase.total_amount-v_paid','round(v_purchase.total_amount,2)-v_paid');
 definition:=replace(definition,'-- supplier FIFO allocation v149','-- supplier cents v162'||chr(10)||'     -- supplier FIFO allocation v149');
 execute definition;
 select pg_get_functiondef('public.recalculate_operation_documents(uuid[],uuid[])'::regprocedure) into definition;
 definition:=replace(definition, $old$when v_paid>=v_total then 'Pagado'$old$, $new$when v_paid>=round(v_total,2) then 'Pagado'$new$);
 execute definition;
end $migration$;
commit;

