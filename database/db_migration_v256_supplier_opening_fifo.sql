begin;
create function public.plan_supplier_account_fifo(p_supplier uuid,p_currency text,p_amount numeric,p_day date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare remaining numeric:=p_amount;value numeric;r record;docs jsonb:='[]';opening jsonb:='[]';
begin
 if p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) or p_currency not in ('ARS','USD') or p_day is null then raise exception 'Parámetros FIFO inválidos.';end if;
 for r in
  select * from (
   select 'purchase' kind,p.id::text key,(coalesce(p.purchase_date,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date as entry_day,
    greatest(0,round(p.total_amount,2)-supplier_purchase_cash_applied(p.id)-supplier_purchase_credit_applied(p.id)) pending
   from supplier_purchases p where p.supplier_id=p_supplier and p.currency=p_currency and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito' and supplier_document_in_account(p.id)
   union all
   select 'opening',p.item_key,coalesce(p.document_date,s.start_date),p.pending_amount from supplier_opening_positions p join supplier_account_starts s on s.supplier_id=p.supplier_id
   where p.supplier_id=p_supplier and p.currency=p_currency and p.amount>0
  ) candidates where candidates.entry_day<=p_day and pending>0 order by candidates.entry_day,kind,key
 loop
  exit when remaining<=0;value:=least(remaining,r.pending);remaining:=remaining-value;
  if r.kind='purchase' then docs:=docs||jsonb_build_array(jsonb_build_object('purchase_id',r.key,'amount',value::text));
  else opening:=opening||jsonb_build_array(jsonb_build_object('targetKey',r.key,'amount',value::text));end if;
 end loop;
 return jsonb_build_object('documents',docs,'opening',opening,'available',remaining);
end $$;
do $patch$
declare definition text;start_at integer;end_at integer;anchor text;replacement text;
begin
 select pg_get_functiondef('mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
 anchor:='if p_payload#>>''{detail,supplier_allocation_mode}''=''oldest_first'' then';start_at:=position(anchor in definition);
 anchor:='raise exception ''Forma de aplicar el pago a proveedor inválida.'';';end_at:=position(anchor in definition);
 if start_at=0 or end_at<=start_at then raise exception 'Revisar núcleo FIFO antes de incorporar apertura.';end if;
 end_at:=end_at+length(anchor);end_at:=end_at+position('end if;' in substring(definition from end_at))-1+length('end if;');
 replacement:=$code$
 -- supplier opening FIFO v256: discard client-provided internal plans.
 p_payload:=p_payload#-'{detail,supplier_opening_allocations}';
 if p_payload#>>'{detail,supplier_allocation_mode}'='oldest_first' then
  declare plan jsonb;
  begin
   perform 1 from supplier_account_starts where supplier_id=v_supplier for update;
   perform 1 from supplier_purchases where supplier_id=v_supplier order by id for update;
   plan:=plan_supplier_account_fifo(v_supplier,v_currency,v_amount,v_date);
   p_payload:=jsonb_set(p_payload,'{allocations}',plan->'documents');
   p_payload:=jsonb_set(p_payload,'{detail,supplier_opening_allocations}',plan->'opening');
  end;
 elsif p_payload#>>'{detail,supplier_allocation_mode}' is not null and p_payload#>>'{detail,supplier_allocation_mode}'<>'documents' then
  raise exception 'Forma de aplicar el pago a proveedor inválida.';
 end if;
 $code$;
 definition:=substring(definition from 1 for start_at-1)||replacement||substring(definition from end_at);
 anchor:='from jsonb_array_elements(coalesce(p_payload->''allocations'',''[]'')) a;';
 if position(anchor in definition)=0 then raise exception 'Revisar publicación de pago antes de incorporar apertura.';end if;
 replacement:=anchor||$code$
     if jsonb_array_length(coalesce(p_payload#>'{detail,supplier_opening_allocations}','[]'))>0 then
      perform save_supplier_opening_applications(p_actor,p_key,jsonb_build_object('sourceKey','payment:'||v_sp,
       'signature',supplier_opening_application_signature('payment:'||v_sp),'reason','Aplicación automática por antigüedad',
       'allocations',p_payload#>'{detail,supplier_opening_allocations}'));
      select * into v_op from financial_operations where id=v_op.id;
     end if;
 $code$;
 execute replace(definition,anchor,replacement);
end $patch$;
revoke all on function plan_supplier_account_fifo(uuid,text,numeric,date) from public,anon,authenticated;
grant execute on function plan_supplier_account_fifo(uuid,text,numeric,date) to service_role;
notify pgrst,'reload schema';
commit;
