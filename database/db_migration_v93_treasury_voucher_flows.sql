begin;

alter table public.treasury_vouchers
  drop constraint if exists treasury_vouchers_category_check;
alter table public.treasury_vouchers
  add constraint treasury_vouchers_category_check
  check (category in (
    'collection', 'third_party_collection', 'ads', 'owner_withdrawal', 'owner_bill',
    'supplier', 'order', 'other'
  ));
alter table public.treasury_vouchers
  add column if not exists movement_direction text not null default 'outflow'
    check (movement_direction in ('income', 'outflow')),
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists destination_account text;

create table if not exists public.treasury_voucher_orders (
  voucher_id uuid not null references public.treasury_vouchers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  primary key (voucher_id, order_id)
);
create index if not exists idx_treasury_voucher_orders_order
  on public.treasury_voucher_orders(order_id);
insert into public.treasury_voucher_orders (voucher_id, order_id)
select id, order_id from public.treasury_vouchers where order_id is not null
on conflict do nothing;

alter table public.treasury_voucher_orders enable row level security;
drop policy if exists treasury_voucher_orders_read on public.treasury_voucher_orders;
create policy treasury_voucher_orders_read on public.treasury_voucher_orders
  for select to authenticated using (public.can_manage_treasury_settlements());
drop policy if exists treasury_voucher_orders_insert on public.treasury_voucher_orders;
create policy treasury_voucher_orders_insert on public.treasury_voucher_orders
  for insert to authenticated with check (public.can_manage_treasury_settlements());
drop policy if exists treasury_voucher_orders_delete on public.treasury_voucher_orders;
create policy treasury_voucher_orders_delete on public.treasury_voucher_orders
  for delete to authenticated using (public.can_manage_treasury_settlements());
grant select, insert, delete on public.treasury_voucher_orders to authenticated;

notify pgrst, 'reload schema';
commit;
