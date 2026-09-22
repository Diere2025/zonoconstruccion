begin;

-- 1. Crear tabla de tickets electrónicos / transferencias para rendiciones
create table if not exists public.treasury_settlement_electronic_tickets (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.treasury_settlements(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  reference text,
  payment_type text not null default 'POINT',
  order_id uuid references public.orders(id) on delete set null,
  order_code text,
  mp_payment_id text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_treasury_settlement_electronic_tickets_settlement
  on public.treasury_settlement_electronic_tickets(settlement_id, sort_order);

alter table public.treasury_settlement_electronic_tickets enable row level security;

drop policy if exists treasury_settlement_electronic_tickets_read on public.treasury_settlement_electronic_tickets;
create policy treasury_settlement_electronic_tickets_read on public.treasury_settlement_electronic_tickets
  for select to authenticated using (public.can_manage_treasury_settlements());

drop policy if exists treasury_settlement_electronic_tickets_all on public.treasury_settlement_electronic_tickets;
create policy treasury_settlement_electronic_tickets_all on public.treasury_settlement_electronic_tickets
  for all to authenticated using (public.can_manage_treasury_settlements()) with check (public.can_manage_treasury_settlements());

-- 2. Actualizar save_manual_treasury_settlement para soportar p_electronic_tickets
drop function if exists public.save_manual_treasury_settlement(
  uuid, uuid, text, date, text, text, numeric, numeric, numeric, numeric,
  text, text, date, numeric, jsonb, jsonb, boolean
);

create or replace function public.save_manual_treasury_settlement(
  p_actor_id uuid,
  p_settlement_id uuid,
  p_code text,
  p_settlement_date date,
  p_carrier_name text,
  p_route_detail text,
  p_deliveries_total numeric,
  p_electronic_total numeric,
  p_change_fund numeric,
  p_shortage_recovered numeric,
  p_notes text,
  p_whatsapp_message text,
  p_count_date date,
  p_counted_cash_override numeric,
  p_expenses jsonb,
  p_cash_counts jsonb,
  p_confirm boolean default false,
  p_electronic_tickets jsonb default '[]'::jsonb
)
returns public.treasury_settlements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settlement public.treasury_settlements;
  v_tolls_total numeric := 0;
  v_extraordinary_total numeric := 0;
  v_electronic_total numeric := 0;
  v_expected_cash numeric := 0;
  v_counted_cash numeric := 0;
  v_difference numeric := 0;
begin
  if not public.can_manage_treasury_settlements(p_actor_id) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;
  if p_settlement_date is null then raise exception 'La fecha de la rendición es obligatoria.'; end if;
  if nullif(trim(coalesce(p_carrier_name, '')), '') is null then raise exception 'El fletero es obligatorio.'; end if;

  if p_settlement_id is null then
    insert into public.treasury_settlements (
      code, settlement_date, carrier_name, route_detail, source,
      deliveries_total, electronic_total, change_fund, shortage_recovered,
      notes, whatsapp_message, count_date, counted_at, created_by, updated_at
    ) values (
      coalesce(nullif(upper(trim(p_code)), ''), 'REND' || lpad(nextval('public.treasury_settlement_code_seq')::text, 6, '0')),
      p_settlement_date, trim(p_carrier_name), nullif(trim(p_route_detail), ''), 'manual',
      greatest(coalesce(p_deliveries_total, 0), 0), greatest(coalesce(p_electronic_total, 0), 0),
      greatest(coalesce(p_change_fund, 0), 0), coalesce(p_shortage_recovered, 0),
      nullif(trim(p_notes), ''), nullif(trim(p_whatsapp_message), ''), p_count_date,
      case when p_count_date is null then null else now() end, p_actor_id, now()
    ) returning * into v_settlement;
  else
    update public.treasury_settlements set
      code = coalesce(nullif(upper(trim(p_code)), ''), code), settlement_date = p_settlement_date,
      carrier_name = trim(p_carrier_name), route_detail = nullif(trim(p_route_detail), ''),
      deliveries_total = greatest(coalesce(p_deliveries_total, 0), 0),
      electronic_total = greatest(coalesce(p_electronic_total, 0), 0),
      change_fund = greatest(coalesce(p_change_fund, 0), 0), shortage_recovered = coalesce(p_shortage_recovered, 0),
      notes = nullif(trim(p_notes), ''), whatsapp_message = nullif(trim(p_whatsapp_message), ''),
      count_date = p_count_date, counted_at = case when p_count_date is null then counted_at else coalesce(counted_at, now()) end,
      updated_at = now()
    where id = p_settlement_id returning * into v_settlement;
    if v_settlement.id is null then raise exception 'La rendición indicada no existe.'; end if;
  end if;

  -- 1. Gastos (Peajes y Extraordinarios)
  delete from public.treasury_settlement_expenses where settlement_id = v_settlement.id;
  insert into public.treasury_settlement_expenses (settlement_id, expense_type, amount, reference, notes, sort_order)
  select v_settlement.id, e.expense_type, greatest(e.amount, 0), nullif(trim(e.reference), ''), nullif(trim(e.notes), ''), e.sort_order
  from jsonb_to_recordset(coalesce(p_expenses, '[]'::jsonb)) as e(expense_type text, amount numeric, reference text, notes text, sort_order integer)
  where e.expense_type in ('toll', 'extraordinary') and e.amount > 0;

  -- 2. Conteo de Efectivo
  delete from public.treasury_settlement_cash_counts where settlement_id = v_settlement.id;
  insert into public.treasury_settlement_cash_counts (settlement_id, money_kind, denomination, quantity)
  select v_settlement.id, c.money_kind, c.denomination, greatest(c.quantity, 0)
  from jsonb_to_recordset(coalesce(p_cash_counts, '[]'::jsonb)) as c(money_kind text, denomination numeric, quantity integer)
  where c.money_kind in ('bill', 'coin') and c.denomination > 0 and c.quantity > 0;

  -- 3. Tickets Electrónicos / Transferencias
  delete from public.treasury_settlement_electronic_tickets where settlement_id = v_settlement.id;
  insert into public.treasury_settlement_electronic_tickets (
    settlement_id, amount, reference, payment_type, order_id, order_code, mp_payment_id, notes, sort_order
  )
  select
    v_settlement.id,
    greatest(t.amount, 0),
    nullif(trim(t.reference), ''),
    coalesce(nullif(trim(t.payment_type), ''), 'POINT'),
    t.order_id,
    nullif(trim(t.order_code), ''),
    nullif(trim(t.mp_payment_id), ''),
    nullif(trim(t.notes), ''),
    coalesce(t.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_electronic_tickets, '[]'::jsonb)) as t(
    amount numeric, reference text, payment_type text, order_id uuid, order_code text, mp_payment_id text, notes text, sort_order integer
  )
  where t.amount > 0;

  -- Totales calculados
  select coalesce(sum(e.amount) filter (where e.expense_type = 'toll'), 0),
    coalesce(sum(e.amount) filter (where e.expense_type = 'extraordinary'), 0)
  into v_tolls_total, v_extraordinary_total
  from public.treasury_settlement_expenses e where e.settlement_id = v_settlement.id;

  select coalesce(sum(t.amount), 0)
  into v_electronic_total
  from public.treasury_settlement_electronic_tickets t
  where t.settlement_id = v_settlement.id;

  if v_electronic_total = 0 and jsonb_array_length(coalesce(p_electronic_tickets, '[]'::jsonb)) = 0 then
    v_electronic_total := greatest(coalesce(p_electronic_total, 0), 0);
  end if;

  select coalesce(sum(c.denomination * c.quantity), 0) into v_counted_cash
  from public.treasury_settlement_cash_counts c where c.settlement_id = v_settlement.id;
  if p_counted_cash_override is not null and jsonb_array_length(coalesce(p_cash_counts, '[]'::jsonb)) = 0 then
    v_counted_cash := greatest(p_counted_cash_override, 0);
  end if;

  v_expected_cash := greatest(coalesce(p_deliveries_total, 0), 0) + greatest(coalesce(p_change_fund, 0), 0)
    - v_tolls_total - v_extraordinary_total - v_electronic_total;
  v_difference := v_counted_cash + coalesce(p_shortage_recovered, 0) - v_expected_cash;

  update public.treasury_settlements set
    electronic_total = v_electronic_total,
    tolls_total = v_tolls_total, extraordinary_total = v_extraordinary_total,
    expected_cash = v_expected_cash, counted_cash = v_counted_cash, difference = v_difference,
    status = case when p_confirm then 'confirmed' else 'draft' end,
    confirmed_by = case when p_confirm then p_actor_id else null end,
    confirmed_at = case when p_confirm then coalesce(confirmed_at, now()) else null end,
    updated_at = now()
  where id = v_settlement.id returning * into v_settlement;
  return v_settlement;
end;
$$;

revoke all on function public.save_manual_treasury_settlement(
  uuid, uuid, text, date, text, text, numeric, numeric, numeric, numeric,
  text, text, date, numeric, jsonb, jsonb, boolean, jsonb
) from public;
grant execute on function public.save_manual_treasury_settlement(
  uuid, uuid, text, date, text, text, numeric, numeric, numeric, numeric,
  text, text, date, numeric, jsonb, jsonb, boolean, jsonb
) to service_role;

notify pgrst, 'reload schema';
commit;
