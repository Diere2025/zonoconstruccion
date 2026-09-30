-- Retire old direct purchase and spreadsheet reception writers after 2026-09-29.
-- Historical documents remain available for reconciliation.
begin;

create or replace function public.guard_supplier_circuit_writes()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user <> 'authenticated' then return new; end if;

  if tg_table_name = 'supplier_purchases' then
    if tg_op = 'UPDATE' and old.purchase_reception_id is not null
      and (new.purchase_reception_id is distinct from old.purchase_reception_id
        or new.purchase_order_id is distinct from old.purchase_order_id
        or new.purchase_date is distinct from old.purchase_date
        or new.status = 'Anulado') then
      raise exception 'El remito recibido no se puede desvincular, fechar de nuevo ni anular desde el comprobante';
    end if;
    if new.purchase_reception_id is null
      and new.document_type is distinct from 'Nota de Crédito'
      and new.status is distinct from 'Anulado'
      and coalesce(new.purchase_date, now())::date >= date '2026-09-29' then
      raise exception 'Para mercadería nueva registrá la recepción del remito; no generes otra compra o deuda';
    end if;
  elsif tg_table_name = 'purchase_receptions' then
    if new.reception_date::date >= date '2026-09-29' then
      raise exception 'Registrá la recepción desde el formulario actualizado de Compras';
    end if;
  elsif tg_table_name = 'purchase_reception_items' then
    if exists(select 1 from public.purchase_receptions r where r.id=new.purchase_reception_id
      and r.reception_date::date >= date '2026-09-29') then
      raise exception 'Los artículos deben guardarse junto con la recepción';
    end if;
  elsif tg_table_name = 'purchase_order_items' then
    if new.quantity_received is distinct from old.quantity_received
      and exists(select 1 from public.purchase_orders o where o.id=new.purchase_order_id
        and o.order_date::date >= date '2026-09-29') then
      raise exception 'La cantidad recibida se actualiza registrando un remito';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_purchase_circuit_guard on public.supplier_purchases;
create trigger supplier_purchase_circuit_guard
  before insert or update of purchase_reception_id, purchase_order_id, purchase_date, supplier_id, document_type, status on public.supplier_purchases
  for each row execute function public.guard_supplier_circuit_writes();
drop trigger if exists supplier_reception_circuit_guard on public.purchase_receptions;
create trigger supplier_reception_circuit_guard
  before insert on public.purchase_receptions
  for each row execute function public.guard_supplier_circuit_writes();
drop trigger if exists supplier_reception_item_circuit_guard on public.purchase_reception_items;
create trigger supplier_reception_item_circuit_guard
  before insert on public.purchase_reception_items
  for each row execute function public.guard_supplier_circuit_writes();
drop trigger if exists supplier_order_quantity_circuit_guard on public.purchase_order_items;
create trigger supplier_order_quantity_circuit_guard
  before update of quantity_received on public.purchase_order_items
  for each row execute function public.guard_supplier_circuit_writes();
commit;
