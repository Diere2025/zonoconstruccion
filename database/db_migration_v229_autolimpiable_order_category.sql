-- Reconocer el biodigestor autolimpiable también cuando el nombre no dice biodigestor.
-- Sin reclasificación masiva: las reparaciones de pendientes se realizan por separado.
create or replace function public.is_biodigestor_order_item(item_name text, item_sku text, item_quantity numeric)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(item_quantity, 0) > 0
    and (
      lower(coalesce(item_name, '') || ' ' || coalesce(item_sku, '')) ~ '\mbiodigestor(es)?\M'
      or (
        lower(coalesce(item_name, '') || ' ' || coalesce(item_sku, '')) ~ '\mbiofort\M'
        and lower(coalesce(item_name, '') || ' ' || coalesce(item_sku, '')) ~ '\mautolimpi(able|ante)\M'
      )
    )
    and lower(coalesce(item_name, '') || ' ' || coalesce(item_sku, '')) !~ 'descuento|bonificaci|instalaci|mano de obra|\mcono\M';
$$;

-- Una edición de artículos en un pedido cerrado no debe reclasificar su historia.
create or replace function public.enforce_biodigestor_order_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare detected text;
begin
  if new.status not in ('Pendiente', 'Confirmado', 'Entregando') or new.status is null then return new; end if;
  detected := public.resolve_biofort_order_category(new.id);
  if detected is not null then new.category := detected; end if;
  return new;
end;
$$;

create or replace function public.set_biodigestor_category_from_order_item()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare detected text;
begin
  if not exists (select 1 from public.orders where id = new.order_id
    and status in ('Pendiente', 'Confirmado', 'Entregando')) then return new; end if;
  detected := public.resolve_biofort_order_category(new.order_id);
  if detected is not null then
    update public.orders set category = detected
    where id = new.order_id and status in ('Pendiente', 'Confirmado', 'Entregando')
      and category is distinct from detected;
  end if;
  return new;
end;
$$;
