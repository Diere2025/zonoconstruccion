begin;

create table if not exists public.treasury_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_date date not null default current_date,
  category text not null check (category in ('owner_withdrawal', 'ads', 'owner_bill', 'supplier', 'order', 'other')),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'needs_info')),
  amount numeric(14, 2) check (amount is null or amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  counterparty text,
  reference text,
  notes text,
  files jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_treasury_vouchers_date on public.treasury_vouchers(voucher_date desc, created_at desc);
create index if not exists idx_treasury_vouchers_status on public.treasury_vouchers(status, created_at desc);
create index if not exists idx_treasury_vouchers_order on public.treasury_vouchers(order_id) where order_id is not null;

alter table public.treasury_vouchers enable row level security;
drop policy if exists treasury_vouchers_read on public.treasury_vouchers;
create policy treasury_vouchers_read on public.treasury_vouchers
  for select to authenticated using (public.can_manage_treasury_settlements());
drop policy if exists treasury_vouchers_insert on public.treasury_vouchers;
create policy treasury_vouchers_insert on public.treasury_vouchers
  for insert to authenticated with check (public.can_manage_treasury_settlements() and created_by = auth.uid());
drop policy if exists treasury_vouchers_update on public.treasury_vouchers;
create policy treasury_vouchers_update on public.treasury_vouchers
  for update to authenticated using (public.can_manage_treasury_settlements())
  with check (public.can_manage_treasury_settlements());
grant select, insert, update on public.treasury_vouchers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'treasury-vouchers', 'treasury-vouchers', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
commit;
