begin;
-- Protect the deployed importer as well as updated clients. A second delivery
-- on an already received OC requires the normal receipt form.
create or replace function public.guard_imported_purchase_reception()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if coalesce(new.notes,'') not like 'Sincronizado desde DocumentosDeRecepción%' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('purchase-sheet-import:'||new.supplier_id::text,0));
  if new.purchase_order_id is not null and (
    exists(select 1 from purchase_orders where id=new.purchase_order_id and status in ('Cumplido','Cancelado'))
    or exists(select 1 from purchase_order_items where purchase_order_id=new.purchase_order_id and quantity_received>0)
    or exists(select 1 from purchase_receptions r where r.purchase_order_id=new.purchase_order_id)
    or exists(select 1 from purchase_reception_orders r where r.purchase_order_id=new.purchase_order_id)
    or exists(select 1 from purchase_reception_items r join purchase_order_items i on i.id=r.purchase_order_item_id where i.purchase_order_id=new.purchase_order_id)
  ) then raise exception 'La OC ya tiene una recepción o está cerrada. Revisá el remito existente; registrá entregas adicionales desde Recepciones.'; end if;
  if nullif(regexp_replace(lower(coalesce(new.delivery_slip_number,'')),'[^a-z0-9]','','g'),'') is not null and exists(
    select 1 from purchase_receptions r where r.supplier_id=new.supplier_id
    and regexp_replace(lower(coalesce(r.delivery_slip_number,'')),'[^a-z0-9]','','g')=regexp_replace(lower(new.delivery_slip_number),'[^a-z0-9]','','g')
  ) then raise exception 'El remito ya está registrado para este proveedor'; end if;
  return new;
end; $$;
drop trigger if exists imported_purchase_reception_guard on public.purchase_receptions;
create trigger imported_purchase_reception_guard before insert on public.purchase_receptions for each row execute function public.guard_imported_purchase_reception();
commit;
