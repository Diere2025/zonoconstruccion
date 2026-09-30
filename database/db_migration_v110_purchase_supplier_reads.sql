-- Compras needs supplier names and pricing to use purchase orders and replenishment.
-- Management permissions remain governed by the existing administrator policies.
create or replace function public.can_read_purchase_suppliers()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    join public.sellers s
      on s.id = u.id or lower(s.email) = lower(u.email)
    where u.id = auth.uid()
      and s.is_active is true
      and (
        s.role = 'compras'
        or 'compras' = any(coalesce(s.roles, '{}'::text[]))
      )
  );
$$;

revoke all on function public.can_read_purchase_suppliers() from public;
grant execute on function public.can_read_purchase_suppliers() to authenticated;

drop policy if exists "Purchase operators can read suppliers" on public.suppliers;
create policy "Purchase operators can read suppliers"
  on public.suppliers for select to authenticated
  using (public.can_read_purchase_suppliers());

drop policy if exists "Purchase operators can read price lists" on public.price_lists;
create policy "Purchase operators can read price lists"
  on public.price_lists for select to authenticated
  using (public.can_read_purchase_suppliers());

drop policy if exists "Purchase operators can read price list items" on public.price_list_items;
create policy "Purchase operators can read price list items"
  on public.price_list_items for select to authenticated
  using (public.can_read_purchase_suppliers());

drop policy if exists "Purchase operators can read product supplier relations" on public.product_supplier_relations;
create policy "Purchase operators can read product supplier relations"
  on public.product_supplier_relations for select to authenticated
  using (public.can_read_purchase_suppliers());
