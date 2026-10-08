begin;
do $migration$
declare definition text; anchor text;
begin
 select pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
 if position('customer credit v159' in definition)>0 then return; end if;
 anchor:=$old$   if v_type='customer_collection' then
     if v_order_id is null then raise exception 'Elegí el pedido.'; end if;
     select * into strict v_order from public.orders where id=v_order_id for update;
     if v_order.status in ('Cancelado','Anulado') or v_order.client_id is null or v_currency<>'ARS' then raise exception 'Pedido o moneda no disponible para cobro.'; end if;
     v_orders:=array_append(v_orders,v_order_id);
     v_cp:=nullif(p_payload->>'client_payment_id','')::uuid;
     if v_cp is not null then
       select * into strict v_payment from public.client_payments where id=v_cp for update;
       if v_payment.order_id is distinct from v_order_id or v_payment.currency is distinct from v_currency or (v_payment.amount<>v_amount and not coalesce(v_payment.cash_transaction_id=any(v_ids),false))
         or (v_payment.cash_transaction_id is not null and not(v_payment.cash_transaction_id=any(v_ids))) then raise exception 'Ese cobro ya está vinculado o no coincide.'; end if;
       if v_payment.reversed_at is not null and not(v_payment.cash_transaction_id=any(v_ids)) then raise exception 'El cobro fue anulado.'; end if;
       if coalesce(v_payment.cash_transaction_id=any(v_ids),false) then
         select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_order_id and status='Aprobado' and reversed_at is null;
         if v_amount>greatest(0,v_order.total_amount-v_paid) then raise exception 'El importe supera el saldo pendiente del pedido.'; end if;
       end if;
     else
       -- Link an existing approved receipt instead of adding the same receipt
       -- again. Ambiguous partial matches require explicit user selection.
       select count(*) into v_count from public.client_payments where order_id=v_order_id and cash_transaction_id is null
        and status='Aprobado' and reversed_at is null and currency=v_currency;
       if v_count>0 then
         select count(*),min(id::text)::uuid into v_count,v_cp from public.client_payments where order_id=v_order_id and cash_transaction_id is null
          and status='Aprobado' and reversed_at is null and currency=v_currency and amount=v_amount;
         if v_count<>1 then raise exception 'Hay cobros previos: seleccioná el comprobante exacto antes de vincularlo.'; end if;
       else
         select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_order_id and status='Aprobado' and reversed_at is null;
         if v_amount>greatest(0,v_order.total_amount-v_paid) then raise exception 'El importe supera el saldo pendiente del pedido.'; end if;
       end if;
     end if;
   end if;$old$;
 if position(anchor in definition)=0 then raise exception 'El núcleo financiero cambió; revisar cobros antes de migrar.'; end if;
 definition:=replace(definition,'v_cp uuid; v_sp uuid;','v_client uuid; v_applied numeric; v_credit numeric; v_cp uuid; v_sp uuid;');
 definition:=replace(definition,anchor,$new$   -- customer credit v159: receipt allocation and unassigned credit share one cash entry.
   if v_type='customer_collection' then
     v_client:=nullif(p_payload->>'client_id','')::uuid;
     v_cp:=nullif(p_payload->>'client_payment_id','')::uuid;
     v_applied:=0;
     if v_currency<>'ARS' then raise exception 'Los cobros de clientes deben ser en ARS.'; end if;
     if v_order_id is not null then
       select * into strict v_order from public.orders where id=v_order_id for update;
       if v_order.status in ('Cancelado','Anulado') or v_order.client_id is null then raise exception 'Pedido no disponible para cobro.'; end if;
       if v_client is not null and v_client<>v_order.client_id then raise exception 'El cliente no corresponde al pedido.'; end if;
       v_client:=v_order.client_id;
       v_orders:=array_append(v_orders,v_order_id);
       if v_cp is null then
         select count(*) into v_count from public.client_payments where order_id=v_order_id and cash_transaction_id is null
           and status='Aprobado' and reversed_at is null and currency=v_currency;
         if v_count>0 then
           select count(*),min(id::text)::uuid into v_count,v_cp from public.client_payments where order_id=v_order_id and cash_transaction_id is null
             and status='Aprobado' and reversed_at is null and currency=v_currency and amount=v_amount;
           if v_count<>1 then raise exception 'Hay cobros previos: seleccioná el comprobante exacto antes de vincularlo.'; end if;
         end if;
       end if;
       if v_cp is not null then
         select * into strict v_payment from public.client_payments where id=v_cp for update;
         if v_payment.order_id is distinct from v_order_id or v_payment.client_id is distinct from v_client or v_payment.currency is distinct from v_currency
           or (v_payment.cash_transaction_id is not null and not coalesce(v_payment.cash_transaction_id=any(v_ids),false)) then raise exception 'Ese cobro ya está vinculado o no coincide.'; end if;
         if not coalesce(v_payment.cash_transaction_id=any(v_ids),false) then
           if v_payment.status<>'Aprobado' or v_payment.reversed_at is not null then raise exception 'El cobro no está aprobado.'; end if;
           if v_amount<v_payment.amount then raise exception 'El importe recibido es menor que el comprobante vinculado.'; end if;
           v_applied:=v_payment.amount;
         else
           select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_order_id and status='Aprobado' and reversed_at is null;
           v_applied:=least(v_amount,greatest(0,v_order.total_amount-v_paid));
           if v_applied=0 then v_cp:=null; end if;
         end if;
       else
         select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_order_id and status='Aprobado' and reversed_at is null;
         v_applied:=least(v_amount,greatest(0,v_order.total_amount-v_paid));
       end if;
     elsif v_cp is not null then raise exception 'Elegí el pedido del cobro existente.';
     end if;
     if v_client is null then raise exception 'Elegí un pedido o cliente.'; end if;
     perform 1 from public.clients where id=v_client;
     if not found then raise exception 'Cliente inexistente.'; end if;
     v_credit:=v_amount-v_applied;
   end if;$new$);
 anchor:=$old$   elsif v_type='customer_collection' then
     if v_cp is not null then
       update public.client_payments set amount=v_amount,cash_transaction_id=v_id,financial_account_id=v_account.id,payment_method_id=v_pm,status='Aprobado',reversed_at=null where id=v_cp;
     else
       insert into public.client_payments(client_id,order_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,status,notes,created_by,created_at)
        values(v_order.client_id,v_order_id,v_amount,v_currency,v_pm,v_id,v_account.id,'Aprobado',p_payload->>'concept',p_actor,v_timestamp);
     end if;
   end if;$old$;
 if position(anchor in definition)=0 then raise exception 'No se encontró el registro contable del cobro.'; end if;
 definition:=replace(definition,anchor,$new$   elsif v_type='customer_collection' then
     if v_applied>0 then
       if v_cp is not null then
         update public.client_payments set amount=v_applied,cash_transaction_id=v_id,financial_account_id=v_account.id,payment_method_id=v_pm,status='Aprobado',reversed_at=null where id=v_cp;
       else
         insert into public.client_payments(client_id,order_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,status,notes,created_by,created_at)
           values(v_client,v_order_id,v_applied,v_currency,v_pm,v_id,v_account.id,'Aprobado',p_payload->>'concept',p_actor,v_timestamp);
       end if;
     end if;
     if v_credit>0 then
       insert into public.client_payments(client_id,order_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,status,notes,created_by,created_at)
         values(v_client,null,v_credit,v_currency,v_pm,v_id,v_account.id,'Aprobado','Saldo a favor sin imputar · '||coalesce(p_payload->>'concept',''),p_actor,v_timestamp);
     end if;
   end if;$new$);
 execute definition;
end $migration$;
commit;
