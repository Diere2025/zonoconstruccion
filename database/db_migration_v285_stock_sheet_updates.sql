begin;

create or replace function public.apply_stock_sheet_updates(p_updates jsonb)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with updated as (
    update public.products p
    set stock_physical = u.stock_physical,
        stock_reserved = u.stock_reserved,
        stock_current = u.stock_current
    from jsonb_to_recordset(p_updates) as u(
      id uuid, stock_physical numeric, stock_reserved numeric, stock_current numeric
    )
    where p.id = u.id
      and p.is_outlet_unit = false
      and p.is_service is not true
      and (p.stock_physical, p.stock_reserved, p.stock_current)
        is distinct from (u.stock_physical, u.stock_reserved, u.stock_current)
    returning p.id
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.apply_stock_sheet_updates(jsonb) from public, anon, authenticated;
grant execute on function public.apply_stock_sheet_updates(jsonb) to service_role;

commit;
