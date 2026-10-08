begin;
-- Extend the installed core so allocation, posting, reversal and retries remain atomic.
do $migration$
declare definition text; anchor text; fifo text;
begin
 select pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
 if position('supplier FIFO allocation v149' in definition)>0 then return; end if;
 anchor := 'if jsonb_typeof(coalesce(p_payload->''allocations'',''[]''))<>''array'' or jsonb_array_length(coalesce(p_payload->''allocations'',''[]''))>100 then raise exception ''Imputaciones inválidas.''; end if;';
 if position(anchor in definition)=0 then raise exception 'El núcleo financiero cambió; revisar la asignación a cuenta corriente.'; end if;
 fifo := $fifo$
     -- supplier FIFO allocation v149: supplier is already locked; old payment effects reversed.
     if p_payload#>>'{detail,supplier_allocation_mode}'='oldest_first' then
       declare remaining numeric:=v_amount; due numeric; assigned jsonb:='[]'::jsonb; doc record;
       begin
         -- Lock in UUID order, like the existing explicit-allocation path.
         perform 1 from public.supplier_purchases
           where supplier_id=v_supplier and currency=v_currency and status<>'Anulado'
             and document_type is distinct from 'Nota de Crédito' and total_amount>0
             and (coalesce(purchase_date,created_at) at time zone 'America/Argentina/Buenos_Aires')::date<=v_date
           order by id for update;
         for doc in select * from public.supplier_purchases
           where supplier_id=v_supplier and currency=v_currency and status<>'Anulado'
             and document_type is distinct from 'Nota de Crédito' and total_amount>0
             and (coalesce(purchase_date,created_at) at time zone 'America/Argentina/Buenos_Aires')::date<=v_date
           order by coalesce(purchase_date,created_at),created_at,id loop
           exit when remaining<=0;
           select greatest(0,doc.total_amount-coalesce(sum(a.amount),0)) into due
             from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id
             where a.purchase_id=doc.id and p.reversed_at is null;
           if due>0 then
             due:=least(due,remaining);
             assigned:=assigned||jsonb_build_array(jsonb_build_object('purchase_id',doc.id,'amount',to_char(due,'FM999999999999990.00')));
             remaining:=remaining-due;
           end if;
         end loop;
         p_payload:=jsonb_set(p_payload,'{allocations}',assigned);
       end;
     elsif p_payload#>>'{detail,supplier_allocation_mode}' is not null
       and p_payload#>>'{detail,supplier_allocation_mode}'<>'documents' then
       raise exception 'Forma de aplicar el pago a proveedor inválida.';
     end if;
 $fifo$;
 definition:=replace(definition,anchor,fifo||anchor);
 execute definition;
end $migration$;

create or replace function public.supplier_payment_fifo_available()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$select position('supplier FIFO allocation v149' in pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure))>0$$;
revoke all on function public.supplier_payment_fifo_available() from public,anon,authenticated;
grant execute on function public.supplier_payment_fifo_available() to service_role;
commit;
