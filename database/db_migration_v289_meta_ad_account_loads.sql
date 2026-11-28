begin;

create table if not exists public.meta_ad_account_loads (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  account_id text not null,
  account_name text not null,
  event_type text not null check (event_type in ('ad_account_update_spend_limit', 'funding_event_successful')),
  event_time timestamptz not null,
  event_date_ar date not null,
  currency text not null check (currency in ('USD', 'ARS')),
  amount_cents bigint not null check (amount_cents > 0),
  amount numeric(14, 2) not null check (amount > 0),
  old_limit_cents bigint,
  new_limit_cents bigint,
  source text not null default 'meta_api' check (source in ('meta_api', 'telegram_webhook', 'meta_ads_live', 'manual')),
  raw_extra_data jsonb,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'verified', 'discrepancy')),
  reconciliation_note text not null default '' check (length(reconciliation_note) <= 1000),
  reconciliation_reference text not null default '' check (length(reconciliation_reference) <= 200),
  reconciled_at timestamptz,
  reconciled_by uuid,
  reconciled_by_name text,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meta_ad_account_loads_event_time
  on public.meta_ad_account_loads (event_time desc);

create index if not exists idx_meta_ad_account_loads_account_time
  on public.meta_ad_account_loads (account_id, event_time desc);

create index if not exists idx_meta_ad_account_loads_event_date_ar
  on public.meta_ad_account_loads (event_date_ar desc);

create index if not exists idx_meta_ad_account_loads_reconciliation
  on public.meta_ad_account_loads (reconciliation_status, event_time desc);

alter table public.meta_ad_account_loads enable row level security;

revoke all on public.meta_ad_account_loads from public, anon, authenticated;
grant all on public.meta_ad_account_loads to service_role;

commit;
