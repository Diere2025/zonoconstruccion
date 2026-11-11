begin;

-- A refund references its original order without creating or changing a client receipt.
alter table public.cash_transactions add column if not exists refund_order_id uuid
 references public.orders(id) on delete restrict;
create index if not exists cash_transactions_refund_order_idx
 on public.cash_transactions(refund_order_id) where refund_order_id is not null;

do $migration$
declare
 definition text;
 old_set text := 'employee_id=v_employee,business_unit=';
 new_set text := 'refund_order_id=nullif(p_payload->>''refund_order_id'','''')::uuid, employee_id=v_employee,business_unit=';
 check_at text := 'if v_type=''internal_transfer'' then' || chr(10) || '     if v_account_id=';
 refund_check text := $check$
   -- Customer refunds can be saved while their order is pending identification.
   if coalesce(v_concept.category='Recaudación' and v_concept.movement_type='Egreso'
       and v_concept.concept in ('Devolución de cobro','Devolución parcial de cobro'),false) then
     if v_type<>'general' or v_direction<>'egreso' then raise exception 'La devolución debe registrarse como egreso.'; end if;
   elsif nullif(p_payload->>'refund_order_id','') is not null then
     raise exception 'El pedido de devolución no corresponde a la clasificación.';
   end if;
$check$;
begin
 select replace(pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure),E'\r\n',E'\n') into definition;
 if position('Customer refunds can be saved while their order is pending identification.' in definition)>0 then return; end if;
 if position('Required customer refund order.' in definition)>0 then
   execute replace(replace(definition,
     'Required customer refund order.', 'Customer refunds can be saved while their order is pending identification.'),
     $old$     if nullif(p_payload->>'refund_order_id','') is null then raise exception 'Seleccioná el pedido de la devolución.'; end if;$old$, '');
   return;
 end if;
 if position(old_set in definition)=0 or position(check_at in definition)=0 then
   raise exception 'Cambió la función de Movimientos: revisar la migración de devoluciones.';
 end if;
 execute replace(replace(definition,check_at,refund_check||'   '||check_at),old_set,new_set);
end $migration$;

notify pgrst,'reload schema';
commit;
