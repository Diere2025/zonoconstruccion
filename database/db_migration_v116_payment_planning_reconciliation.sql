begin;

alter table public.payment_planning_realizations
  add column if not exists cash_transaction_id uuid references public.cash_transactions(id);
create unique index if not exists payment_planning_realizations_cash_transaction_uidx
  on public.payment_planning_realizations(cash_transaction_id) where cash_transaction_id is not null;

create table if not exists public.payment_planning_source_rows (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null references public.payment_planning_import_batches(source_hash),
  source_key text not null unique,
  sheet_row integer not null check (sheet_row > 0),
  fund_id uuid not null references public.payment_planning_funds(id),
  source_date date not null,
  title text not null,
  source_effect numeric(15,2),
  source_balance numeric(15,2),
  classification text not null check (classification in ('opening','scenario','reserve','release','item','adjustment','control')),
  match_status text not null check (match_status in ('confirmed','review','forecast','control')),
  item_id uuid references public.payment_planning_items(id),
  realization_id uuid references public.payment_planning_realizations(id),
  cash_transaction_id uuid references public.cash_transactions(id),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (match_status <> 'confirmed' or (item_id is not null and realization_id is not null and cash_transaction_id is not null))
);
create index if not exists payment_planning_source_rows_date_idx
  on public.payment_planning_source_rows(fund_id,source_date,sheet_row);
create index if not exists payment_planning_source_rows_review_idx
  on public.payment_planning_source_rows(match_status,source_date);
alter table public.payment_planning_source_rows enable row level security;
revoke all on public.payment_planning_source_rows from anon, authenticated;
grant all on public.payment_planning_source_rows to service_role;

commit;
