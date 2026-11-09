begin;

create table if not exists public.supplier_account_visibility_settings (
  singleton boolean primary key default true check (singleton),
  inactivity_months integer not null default 6 check (inactivity_months between 1 and 120),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.supplier_account_visibility_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.supplier_account_visibility_overrides (
  supplier_id uuid primary key references public.suppliers(id) on delete cascade,
  visibility text not null check (visibility in ('automatic','visible','hidden')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.supplier_account_visibility_settings enable row level security;
alter table public.supplier_account_visibility_overrides enable row level security;
revoke all on public.supplier_account_visibility_settings,public.supplier_account_visibility_overrides from public,anon,authenticated;
grant select,insert,update on public.supplier_account_visibility_settings,public.supplier_account_visibility_overrides to service_role;

create or replace function public.get_supplier_account_dashboard(p_to date default null)
returns table(id uuid,name text,start_date date,balance_ars numeric,balance_usd numeric,
  last_movement date,visibility text,visible boolean)
language sql stable set search_path=public,pg_temp as $$
  with settings as (
    select coalesce(p_to,(now() at time zone 'America/Argentina/Buenos_Aires')::date) as cutoff,
      inactivity_months
    from supplier_account_visibility_settings where singleton
  ), balances as (
    select b.* from get_supplier_account_balances() b where p_to is null
    union all
    select b.* from get_supplier_account_balances_at(p_to) b where p_to is not null
  ), activity as (
    select e.supplier_id,max(e.entry_date) as last_movement
    from supplier_account_entries e cross join settings s
    where e.entry_date<=s.cutoff and not e.voided
    group by e.supplier_id
  )
  select b.id,b.name,b.start_date,b.balance_ars,b.balance_usd,a.last_movement,
    coalesce(o.visibility,'automatic'),
    case o.visibility
      when 'visible' then true
      when 'hidden' then false
      else round(b.balance_ars,2)<>0 or round(b.balance_usd,2)<>0
        or coalesce(a.last_movement>=s.cutoff-make_interval(months=>s.inactivity_months),false)
    end
  from balances b cross join settings s
  left join activity a on a.supplier_id=b.id
  left join supplier_account_visibility_overrides o on o.supplier_id=b.id
  order by b.name,b.id
$$;

revoke all on function public.get_supplier_account_dashboard(date) from public,anon,authenticated;
grant execute on function public.get_supplier_account_dashboard(date) to service_role;
notify pgrst,'reload schema';
commit;
