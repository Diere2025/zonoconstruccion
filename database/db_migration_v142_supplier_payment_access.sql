-- Align supplier payment creation with the roles allowed in Movimientos.
-- Existing payments, balances and administrator policies are preserved.
begin;

create or replace function public.can_register_supplier_payment()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from auth.users u
    join public.sellers s on s.id = u.id
      or (not exists (select 1 from public.sellers direct where direct.id = u.id)
        and lower(s.email) = lower(u.email))
    where u.id = auth.uid() and s.is_active is true
      and (s.role in ('admin', 'administracion')
        or coalesce(s.roles, '{}'::text[]) && array['admin', 'administracion']::text[])
  );
$$;
revoke all on function public.can_register_supplier_payment() from public, anon;
grant execute on function public.can_register_supplier_payment() to authenticated;

-- Older forms omit the author; use the verified session instead of a fixed user.
alter table public.supplier_payments alter column created_by set default auth.uid();

drop policy if exists "Finance operators can insert supplier payments" on public.supplier_payments;
create policy "Finance operators can insert supplier payments"
on public.supplier_payments for insert to authenticated
with check (
  public.can_register_supplier_payment()
  and created_by = auth.uid()
  and reversed_at is null
  and exists (
    select 1 from public.cash_transactions t
    where t.id = supplier_payments.cash_transaction_id
      and t.created_by = auth.uid() and t.type = 'egreso'
      and t.amount = supplier_payments.amount and t.currency = supplier_payments.currency
      and t.financial_account_id is not distinct from supplier_payments.financial_account_id
      and t.payment_method_id = supplier_payments.payment_method_id
      and t.operation_id is null
  )
  and (purchase_id is null or exists (
    select 1 from public.supplier_purchases p
    where p.id = supplier_payments.purchase_id
      and p.supplier_id = supplier_payments.supplier_id
      and p.currency = supplier_payments.currency
  ))
);

-- The server's atomic financial workflow must accept the same finance role.
create or replace function public.can_manage_financial_operations(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.users u left join public.sellers s
    on s.id = u.id or (not exists (select 1 from public.sellers direct where direct.id = u.id)
      and lower(s.email) = lower(u.email))
    where u.id = p_user_id and coalesce(s.is_active, true)
      and (s.role in ('admin', 'administracion')
        or coalesce(s.roles, '{}'::text[]) && array['admin', 'administracion']::text[]
        or lower(u.email) in ('diego.boveda@gmail.com', 'caroibarra.93@gmail.com')));
$$;
revoke all on function public.can_manage_financial_operations(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_financial_operations(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
