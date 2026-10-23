-- Prioridades de volumen logístico aprobadas: tanque físico y MEP con accesorios.
-- No calcula m3 ni compara litros con kg. No reclasifica datos históricos.
create or replace function public.resolve_volume_order_category(target_order_id uuid)
returns text language sql stable set search_path = public, pg_temp as $$
  with items as (
    select lower(coalesce(i.product_name, p.name, '') || ' ' || coalesce(p.sku, '')) full_name
    from public.order_items i left join public.products p on p.id = i.product_id
    where i.order_id = target_order_id and i.quantity > 0
  ), classified as (
    select full_name,
      (full_name ~ 'equilibrio|\mmeps?\M|revestimiento|membrana'
       and full_name !~ 'rollo|asfalt|aluflex|megaflex|descuento|bonificaci') mep,
      full_name ~ '\mrodillo\M|\mpincel\M|\mvenda\M' accessory
    from items
  )
  select coalesce(public.resolve_biofort_order_category(target_order_id), case
    when exists(select 1 from items
      where full_name ~ 'aquafort|\mtanque\M|\mcisterna\M'
      and full_name ~ '[0-9]+([.,][0-9]+)?[[:space:]]*(l\M|litros?\M)'
      and full_name !~ 'termotanque|descuento|bonificaci|instalaci|mano de obra|\mbase\M|flotante|flotador|filtro|autom[aá]tico|\mtapa\M|\mcaño\M') then 'TANQUES'
    when (select bool_or(mep) and bool_and(mep or accessory) from classified) then 'MEP'
    else null end);
$$;
revoke all on function public.resolve_volume_order_category(uuid) from public, anon, authenticated;

create or replace function public.enforce_biodigestor_order_category()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare detected text;
begin
  if new.status not in ('Pendiente', 'Confirmado', 'Entregando') or new.status is null then return new; end if;
  detected := public.resolve_volume_order_category(new.id);
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
  detected := public.resolve_volume_order_category(new.order_id);
  if detected is not null then
    update public.orders set category = detected
    where id = new.order_id and status in ('Pendiente', 'Confirmado', 'Entregando')
      and category is distinct from detected;
  end if;
  return new;
end;
$$;
