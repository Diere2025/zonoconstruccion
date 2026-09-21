begin;

create sequence if not exists public.treasury_settlement_code_seq start with 100000;

create table if not exists public.treasury_settlements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('REND' || lpad(nextval('public.treasury_settlement_code_seq')::text, 6, '0')),
  route_sheet_id uuid not null unique references public.route_sheets(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  change_fund numeric not null default 0 check (change_fund >= 0),
  shortage_recovered numeric not null default 0 check (shortage_recovered >= 0),
  deliveries_total numeric not null default 0,
  electronic_total numeric not null default 0,
  tolls_total numeric not null default 0,
  extraordinary_total numeric not null default 0,
  expected_cash numeric not null default 0,
  counted_cash numeric not null default 0,
  difference numeric not null default 0,
  whatsapp_message text,
  notes text,
  counted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treasury_settlement_payment_links (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.treasury_settlements(id) on delete cascade,
  client_payment_id uuid not null references public.client_payments(id) on delete restrict,
  payment_kind text not null check (payment_kind in ('cash', 'electronic')),
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (settlement_id, client_payment_id),
  unique (client_payment_id)
);

create table if not exists public.treasury_settlement_expenses (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.treasury_settlements(id) on delete cascade,
  expense_type text not null check (expense_type in ('toll', 'extraordinary')),
  amount numeric not null check (amount >= 0),
  reference text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.treasury_settlement_cash_counts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.treasury_settlements(id) on delete cascade,
  money_kind text not null check (money_kind in ('bill', 'coin')),
  denomination numeric not null check (denomination > 0),
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  unique (settlement_id, money_kind, denomination)
);

create index if not exists idx_treasury_settlements_status_updated
  on public.treasury_settlements(status, updated_at desc);
create index if not exists idx_treasury_settlement_payment_links_settlement
  on public.treasury_settlement_payment_links(settlement_id);
create index if not exists idx_treasury_settlement_expenses_settlement
  on public.treasury_settlement_expenses(settlement_id, expense_type, sort_order);
create index if not exists idx_treasury_settlement_cash_counts_settlement
  on public.treasury_settlement_cash_counts(settlement_id);

create or replace function public.can_manage_treasury_settlements(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    left join public.sellers s
      on s.id = u.id or lower(s.email) = lower(u.email)
    where u.id = p_user_id
      and coalesce(s.is_active, true) is distinct from false
      and (
        lower(coalesce(u.email, '')) in ('diego.boveda@gmail.com', 'caroibarra.93@gmail.com')
        or
        s.role in ('admin', 'administracion')
        or coalesce(s.roles, '{}'::text[]) && array['admin', 'administracion']::text[]
      )
  );
$$;

alter table public.treasury_settlements enable row level security;
alter table public.treasury_settlement_payment_links enable row level security;
alter table public.treasury_settlement_expenses enable row level security;
alter table public.treasury_settlement_cash_counts enable row level security;

drop policy if exists treasury_settlements_read on public.treasury_settlements;
create policy treasury_settlements_read on public.treasury_settlements
  for select to authenticated using (public.can_manage_treasury_settlements());

drop policy if exists treasury_settlement_payment_links_read on public.treasury_settlement_payment_links;
create policy treasury_settlement_payment_links_read on public.treasury_settlement_payment_links
  for select to authenticated using (public.can_manage_treasury_settlements());

drop policy if exists treasury_settlement_expenses_read on public.treasury_settlement_expenses;
create policy treasury_settlement_expenses_read on public.treasury_settlement_expenses
  for select to authenticated using (public.can_manage_treasury_settlements());

drop policy if exists treasury_settlement_cash_counts_read on public.treasury_settlement_cash_counts;
create policy treasury_settlement_cash_counts_read on public.treasury_settlement_cash_counts
  for select to authenticated using (public.can_manage_treasury_settlements());

create or replace function public.save_treasury_settlement(
  p_actor_id uuid,
  p_route_sheet_id uuid,
  p_change_fund numeric,
  p_shortage_recovered numeric,
  p_notes text,
  p_whatsapp_message text,
  p_payments jsonb,
  p_expenses jsonb,
  p_cash_counts jsonb,
  p_confirm boolean default false
)
returns public.treasury_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.treasury_settlements;
  v_route_status text;
  v_delivery_total numeric := 0;
  v_electronic_total numeric := 0;
  v_tolls_total numeric := 0;
  v_extraordinary_total numeric := 0;
  v_expected_cash numeric := 0;
  v_counted_cash numeric := 0;
  v_difference numeric := 0;
begin
  if not public.can_manage_treasury_settlements(p_actor_id) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;

  select rs.status into v_route_status
  from public.route_sheets rs
  where rs.id = p_route_sheet_id
  for update;

  if v_route_status is null then
    raise exception 'La hoja de ruta indicada no existe.';
  end if;
  if v_route_status <> 'Cerrada' then
    raise exception 'El recorrido debe estar finalizado antes de iniciar la rendición.';
  end if;

  insert into public.treasury_settlements (
    route_sheet_id, change_fund, shortage_recovered, notes, whatsapp_message,
    counted_at, created_by, updated_at
  ) values (
    p_route_sheet_id, greatest(coalesce(p_change_fund, 0), 0),
    greatest(coalesce(p_shortage_recovered, 0), 0), nullif(trim(p_notes), ''),
    nullif(trim(p_whatsapp_message), ''), now(), p_actor_id, now()
  )
  on conflict (route_sheet_id) do update set
    change_fund = excluded.change_fund,
    shortage_recovered = excluded.shortage_recovered,
    notes = excluded.notes,
    whatsapp_message = excluded.whatsapp_message,
    counted_at = excluded.counted_at,
    updated_at = now()
  where treasury_settlements.status = 'draft'
  returning * into v_settlement;

  if v_settlement.id is null then
    raise exception 'La rendición ya fue confirmada y no admite cambios.';
  end if;

  delete from public.treasury_settlement_payment_links where settlement_id = v_settlement.id;
  delete from public.treasury_settlement_expenses where settlement_id = v_settlement.id;
  delete from public.treasury_settlement_cash_counts where settlement_id = v_settlement.id;

  insert into public.treasury_settlement_payment_links (
    settlement_id, client_payment_id, payment_kind, amount
  )
  select
    v_settlement.id,
    payment_row.client_payment_id,
    payment_row.payment_kind,
    greatest(payment_row.amount, 0)
  from jsonb_to_recordset(coalesce(p_payments, '[]'::jsonb)) as payment_row(
    client_payment_id uuid,
    payment_kind text,
    amount numeric
  )
  join public.client_payments cp on cp.id = payment_row.client_payment_id
  where payment_row.payment_kind in ('cash', 'electronic')
    and payment_row.amount >= 0
    and (
      cp.route_sheet_id = p_route_sheet_id
      or exists (
        select 1
        from public.deliveries d
        where d.route_sheet_id = p_route_sheet_id and d.order_id = cp.order_id
      )
    );

  if (select count(*) from public.treasury_settlement_payment_links where settlement_id = v_settlement.id)
     <> jsonb_array_length(coalesce(p_payments, '[]'::jsonb)) then
    raise exception 'Uno o más pagos no pertenecen a los pedidos del recorrido.';
  end if;

  insert into public.treasury_settlement_expenses (
    settlement_id, expense_type, amount, reference, notes, sort_order
  )
  select
    v_settlement.id,
    expense_row.expense_type,
    greatest(expense_row.amount, 0),
    nullif(trim(expense_row.reference), ''),
    nullif(trim(expense_row.notes), ''),
    expense_row.sort_order
  from jsonb_to_recordset(coalesce(p_expenses, '[]'::jsonb)) as expense_row(
    expense_type text,
    amount numeric,
    reference text,
    notes text,
    sort_order integer
  )
  where expense_row.expense_type in ('toll', 'extraordinary')
    and expense_row.amount > 0;

  insert into public.treasury_settlement_cash_counts (
    settlement_id, money_kind, denomination, quantity
  )
  select
    v_settlement.id,
    count_row.money_kind,
    count_row.denomination,
    greatest(count_row.quantity, 0)
  from jsonb_to_recordset(coalesce(p_cash_counts, '[]'::jsonb)) as count_row(
    money_kind text,
    denomination numeric,
    quantity integer
  )
  where count_row.money_kind in ('bill', 'coin')
    and count_row.denomination > 0
    and count_row.quantity > 0;

  select
    coalesce(sum(l.amount), 0),
    coalesce(sum(l.amount) filter (where l.payment_kind = 'electronic'), 0)
  into v_delivery_total, v_electronic_total
  from public.treasury_settlement_payment_links l
  where l.settlement_id = v_settlement.id;

  select
    coalesce(sum(e.amount) filter (where e.expense_type = 'toll'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'extraordinary'), 0)
  into v_tolls_total, v_extraordinary_total
  from public.treasury_settlement_expenses e
  where e.settlement_id = v_settlement.id;

  select coalesce(sum(c.denomination * c.quantity), 0)
  into v_counted_cash
  from public.treasury_settlement_cash_counts c
  where c.settlement_id = v_settlement.id;

  v_expected_cash := v_delivery_total + greatest(coalesce(p_change_fund, 0), 0)
    - v_tolls_total - v_extraordinary_total - v_electronic_total;
  v_difference := v_counted_cash + greatest(coalesce(p_shortage_recovered, 0), 0) - v_expected_cash;

  update public.treasury_settlements set
    deliveries_total = v_delivery_total,
    electronic_total = v_electronic_total,
    tolls_total = v_tolls_total,
    extraordinary_total = v_extraordinary_total,
    expected_cash = v_expected_cash,
    counted_cash = v_counted_cash,
    difference = v_difference,
    status = case when p_confirm then 'confirmed' else 'draft' end,
    confirmed_by = case when p_confirm then p_actor_id else null end,
    confirmed_at = case when p_confirm then now() else null end,
    updated_at = now()
  where id = v_settlement.id
  returning * into v_settlement;

  if p_confirm then
    update public.client_payments cp set
      route_sheet_id = coalesce(cp.route_sheet_id, p_route_sheet_id),
      status = 'Aprobado'
    from public.treasury_settlement_payment_links l
    where l.settlement_id = v_settlement.id and l.client_payment_id = cp.id;

    update public.orders o set payment_approved = true
    where exists (
      select 1
      from public.client_payments cp
      join public.treasury_settlement_payment_links l on l.client_payment_id = cp.id
      where l.settlement_id = v_settlement.id and cp.order_id = o.id
    );
  end if;

  return v_settlement;
end;
$$;

revoke all on function public.save_treasury_settlement(
  uuid, uuid, numeric, numeric, text, text, jsonb, jsonb, jsonb, boolean
) from public;
grant execute on function public.save_treasury_settlement(
  uuid, uuid, numeric, numeric, text, text, jsonb, jsonb, jsonb, boolean
) to service_role;

grant select on public.treasury_settlements to authenticated;
grant select on public.treasury_settlement_payment_links to authenticated;
grant select on public.treasury_settlement_expenses to authenticated;
grant select on public.treasury_settlement_cash_counts to authenticated;

notify pgrst, 'reload schema';

commit;
