-- Read the date range from orders first and page item rows with a stable cursor.
-- SECURITY INVOKER keeps the existing order and order item policies in effect.
create or replace function public.purchase_replenishment_sales(
  p_from date,
  p_to date default null,
  p_after_date date default null,
  p_after_order uuid default null,
  p_after_item uuid default null
)
returns table (
  item_id uuid,
  order_id uuid,
  order_date date,
  product_id uuid,
  product_name text,
  quantity numeric
)
language sql stable security invoker
set search_path = ''
as $$
  select i.id, o.id, o.order_date, i.product_id, i.product_name, i.quantity
  from public.orders o
  join public.order_items i on i.order_id = o.id
  where o.order_date >= greatest(p_from, p_after_date)
    and (p_to is null or o.order_date <= p_to)
    and o.status <> 'Cancelado'
    and i.quantity > 0
    and (
      p_after_date is null
      or (o.order_date, o.id, i.id) > (p_after_date, p_after_order, p_after_item)
    )
  order by o.order_date, o.id, i.id
  limit 500;
$$;

revoke execute on function public.purchase_replenishment_sales(date, date, date, uuid, uuid)
  from public, anon;
grant execute on function public.purchase_replenishment_sales(date, date, date, uuid, uuid)
  to authenticated;
