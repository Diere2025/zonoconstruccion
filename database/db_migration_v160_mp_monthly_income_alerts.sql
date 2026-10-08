begin;
create table if not exists public.mp_monthly_income_alerts (
 month date not null,
 account_id text not null,
 threshold bigint not null check(threshold in (10000000,20000000,30000000,40000000)),
 status text not null default 'pending' check(status in ('pending','sent')),
 lease_until timestamptz not null,
 sent_at timestamptz,
 primary key(month,account_id,threshold)
);
alter table public.mp_monthly_income_alerts enable row level security;
revoke all on public.mp_monthly_income_alerts from public,anon,authenticated;
grant select,insert,update,delete on public.mp_monthly_income_alerts to service_role;
commit;
