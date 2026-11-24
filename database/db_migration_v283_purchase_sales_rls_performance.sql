-- Compute the purchase permission once per query plan instead of per row
-- when PostgREST reads order items with their parent orders.
alter policy "Purchase operators can read sales orders"
  on public.orders
  using ((select public.can_read_purchase_suppliers()));

alter policy "Purchase operators can read sales items"
  on public.order_items
  using ((select public.can_read_purchase_suppliers()));
