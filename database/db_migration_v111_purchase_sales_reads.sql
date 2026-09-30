-- Replenishment calculates demand from order_items joined to orders.
-- Purchase operators need both reads; supplier access alone returns zero sales.
drop policy if exists "Purchase operators can read sales orders" on public.orders;
create policy "Purchase operators can read sales orders"
  on public.orders for select to authenticated
  using (public.can_read_purchase_suppliers());

drop policy if exists "Purchase operators can read sales items" on public.order_items;
create policy "Purchase operators can read sales items"
  on public.order_items for select to authenticated
  using (public.can_read_purchase_suppliers());
