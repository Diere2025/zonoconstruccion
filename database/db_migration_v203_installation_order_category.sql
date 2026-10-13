-- Los componentes a $0 de una instalación no son ventas separadas de biodigestores.
create or replace function public.resolve_biofort_order_category(target_order_id uuid)
returns text language sql stable set search_path = public, pg_temp as $$
  with items as (
    select lower(coalesce(i.product_name, p.name, '') || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.category, '')) as full_name,
      i.quantity, i.unit_price,
      public.is_biodigestor_order_item(coalesce(i.product_name, p.name), p.sku, i.quantity) as biodigestor
    from public.order_items i left join public.products p on p.id = i.product_id
    where i.order_id = target_order_id
  ), installation as (
    select exists(select 1 from items where quantity > 0
      and full_name ~ 'instalaci|mano de obra'
      and full_name ~ 'biofort|biodigestor|séptic|septic') as present
  )
  select case
    when exists(select 1 from items where biodigestor and (not installation.present or unit_price is distinct from 0)) then 'BIODIGESTOR'
    when installation.present then 'INSTALACIÓN BIOFORT'
    else null
  end from installation;
$$;
revoke all on function public.resolve_biofort_order_category(uuid) from public, anon, authenticated;

create or replace function public.enforce_biodigestor_order_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare detected text;
begin
  detected := public.resolve_biofort_order_category(new.id);
  if detected is not null then new.category := detected; end if;
  return new;
end;
$$;

create or replace function public.set_biodigestor_category_from_order_item()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare detected text;
begin
  detected := public.resolve_biofort_order_category(new.order_id);
  if detected is not null then
    update public.orders set category = detected
    where id = new.order_id and category is distinct from detected;
  end if;
  return new;
end;
$$;

-- Cambios de precio pueden separar un biodigestor del kit o incluirlo nuevamente.
drop trigger if exists set_biodigestor_category_from_order_item on public.order_items;
create trigger set_biodigestor_category_from_order_item
  after insert or update of product_name, product_id, quantity, unit_price on public.order_items
  for each row execute function public.set_biodigestor_category_from_order_item();

-- Reparación puntual del pedido reportado, sin reclasificar otros pedidos históricos.
update public.orders set category = 'INSTALACIÓN BIOFORT'
where id = 'ba5d29c3-b15f-4702-a4d1-def2f57e7798'
  and legacy_code = 'JS26123 / JS26124'
  and public.resolve_biofort_order_category(id) = 'INSTALACIÓN BIOFORT'
  and category is distinct from 'INSTALACIÓN BIOFORT';
