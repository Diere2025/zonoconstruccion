begin;

create table if not exists public.mp_daily_aliases (
  collection_date date primary key,
  aliases text[] not null check (
    cardinality(aliases) = 2
    and array_ndims(aliases) = 1
    and array_lower(aliases, 1) = 1
    and array_position(aliases, null) is null
    and aliases[1] <> aliases[2]
    and aliases <@ array['diegozono.mp', 'pagoszono.26', 'cobroszono']
  ),
  published_by uuid not null,
  published_at timestamptz not null default now()
);

alter table public.mp_daily_aliases enable row level security;
revoke all on public.mp_daily_aliases from public, anon, authenticated, service_role;
grant select, insert on public.mp_daily_aliases to service_role;

notify pgrst, 'reload schema';

commit;
