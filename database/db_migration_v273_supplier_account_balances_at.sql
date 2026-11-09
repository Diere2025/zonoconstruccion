begin;

create or replace function public.get_supplier_account_balances_at(p_to date)
returns table(id uuid, name text, start_date date, balance_ars numeric, balance_usd numeric)
language sql stable set search_path=public,pg_temp as $$
  with movements as (
    select e.supplier_id,
      sum(e.amount) filter (where e.currency='ARS') as ars,
      sum(e.amount) filter (where e.currency='USD') as usd
    from supplier_account_entries e
    join supplier_account_starts st on st.supplier_id=e.supplier_id and st.start_date<=p_to
    left join supplier_account_history h on h.supplier_id=e.supplier_id
      and h.source=e.source and h.source_id=e.source_id
    where e.entry_date<=p_to and not e.voided and coalesce(h.included,e.entry_date>=st.start_date)
    group by e.supplier_id
  )
  select s.id,s.name::text,st.start_date,
    case when st.start_date<=p_to then st.opening_ars+coalesce(m.ars,0) else 0 end,
    case when st.start_date<=p_to then st.opening_usd+coalesce(m.usd,0) else 0 end
  from suppliers s
  left join supplier_account_starts st on st.supplier_id=s.id
  left join movements m on m.supplier_id=s.id
  order by s.name,s.id
$$;

revoke all on function public.get_supplier_account_balances_at(date) from public,anon,authenticated;
grant execute on function public.get_supplier_account_balances_at(date) to service_role;
notify pgrst,'reload schema';
commit;
