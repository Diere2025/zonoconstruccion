-- Un biodigestor físico define el volumen y la facturación del pedido completo.
-- No se reclasifica el historial: la regla rige para nuevas cargas y modificaciones.
create or replace function public.is_biodigestor_order_item(item_name text, item_sku text, item_quantity numeric)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(item_quantity, 0) > 0
    and lower(coalesce(item_name, '') || ' ' || coalesce(item_sku, '')) ~ '\mbiodigestor(es)?\M'
    and lower(coalesce(item_name, '') || ' ' || coalesce(item_sku, '')) !~ 'descuento|bonificaci|instalaci|mano de obra|\mcono\M';
$$;

create or replace function public.enforce_biodigestor_order_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.order_items i
    left join public.products p on p.id = i.product_id
    where i.order_id = new.id
      and public.is_biodigestor_order_item(coalesce(i.product_name, p.name), p.sku, i.quantity)
  ) then
    new.category := 'BIODIGESTOR';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_biodigestor_order_category() from public, anon, authenticated;

create or replace function public.set_biodigestor_category_from_order_item()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.order_items i
    left join public.products p on p.id = i.product_id
    where i.order_id = new.order_id
      and public.is_biodigestor_order_item(coalesce(i.product_name, p.name), p.sku, i.quantity)
  ) then
    update public.orders set category = 'BIODIGESTOR'
    where id = new.order_id and category is distinct from 'BIODIGESTOR';
  end if;
  return new;
end;
$$;
revoke all on function public.set_biodigestor_category_from_order_item() from public, anon, authenticated;

drop trigger if exists enforce_biodigestor_order_category on public.orders;
create trigger enforce_biodigestor_order_category before update of category on public.orders
  for each row execute function public.enforce_biodigestor_order_category();

drop trigger if exists set_biodigestor_category_from_order_item on public.order_items;
create trigger set_biodigestor_category_from_order_item after insert or update of product_name, product_id, quantity on public.order_items
  for each row execute function public.set_biodigestor_category_from_order_item();
