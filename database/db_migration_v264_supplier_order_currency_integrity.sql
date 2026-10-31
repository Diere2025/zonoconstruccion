begin;
create or replace function public.guard_supplier_order_currency() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare order_currency text;receipt_currency text;
begin
 -- supplier OC currency integrity v264: include all linked receipts and preserve known currency.
 if tg_table_name='purchase_orders' then
  if new.currency is distinct from old.currency and exists(select 1 from purchase_receptions r where (r.purchase_order_id=new.id or exists(select 1 from purchase_reception_orders l where l.purchase_reception_id=r.id and l.purchase_order_id=new.id)) and (new.currency is null or r.currency is distinct from new.currency)) then raise exception 'La moneda de la OC no coincide con sus recepciones. Revisá el historial antes de cambiarla.';end if;
 elsif tg_table_name='purchase_receptions' then
  if exists(select 1 from purchase_orders o where o.id=new.purchase_order_id and o.currency is not null and o.currency is distinct from new.currency)
   or exists(select 1 from purchase_reception_orders l join purchase_orders o on o.id=l.purchase_order_id where l.purchase_reception_id=new.id and o.currency is not null and o.currency is distinct from new.currency) then raise exception 'La recepción debe usar la moneda confirmada de todas sus OCs.';end if;
 else
  select currency into order_currency from purchase_orders where id=new.purchase_order_id;
  select currency into receipt_currency from purchase_receptions where id=new.purchase_reception_id;
  if order_currency is not null and receipt_currency is distinct from order_currency then raise exception 'No se pueden agrupar OCs de otra moneda en la recepción.';end if;
 end if;return new;
end $$;
create function public.guard_supplier_order_item_currency() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare old_order purchase_orders;new_order purchase_orders;
begin
 if new.purchase_order_id is distinct from old.purchase_order_id then
  select * into strict old_order from purchase_orders where id=old.purchase_order_id;
  select * into strict new_order from purchase_orders where id=new.purchase_order_id;
  if old_order.supplier_id is distinct from new_order.supplier_id or old_order.currency is distinct from new_order.currency then raise exception 'Solo se pueden mover artículos entre OCs del mismo proveedor y moneda confirmada.';end if;
 end if;return new;
end $$;
create trigger supplier_order_item_currency before update of purchase_order_id on purchase_order_items for each row execute function guard_supplier_order_item_currency();
revoke all on function guard_supplier_order_currency(),guard_supplier_order_item_currency() from public,anon,authenticated;
grant execute on function guard_supplier_order_currency(),guard_supplier_order_item_currency() to service_role;
commit;
