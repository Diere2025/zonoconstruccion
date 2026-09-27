begin;

-- Keep the ticket and its order link for audit, but do not subtract a payment
-- for an undelivered order from the driver's cash settlement.
create or replace function public.recalculate_treasury_settlement_electronic_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket_count integer;
  v_included_total numeric;
begin
  -- Existing confirmed records remain immutable; recalculate while drafting
  -- and at the moment a draft is confirmed.
  if new.route_sheet_id is null or old.status = 'confirmed' then
    return new;
  end if;

  select count(*), coalesce(sum(t.amount) filter (where not exists (
    select 1
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    left join public.mp_payments p on p.id::text = t.mp_payment_id
    where d.route_sheet_id = new.route_sheet_id
      and (
        t.order_id = o.id
        or (nullif(trim(t.order_code), '') is not null and upper(trim(t.order_code)) = upper(trim(o.legacy_code)))
        or p.order_id = o.id
        or (nullif(trim(p.order_code), '') is not null and upper(trim(p.order_code)) = upper(trim(o.legacy_code)))
      )
      and lower(coalesce(d.status, '')) in ('fallido', 'postergado', 'anulado', 'cancelado', 'no entregado')
  )), 0)
  into v_ticket_count, v_included_total
  from public.treasury_settlement_electronic_tickets t
  where t.settlement_id = new.id;

  -- With no detailed tickets, preserve the legacy manually entered total.
  if v_ticket_count > 0 then
    new.electronic_total := v_included_total;
    new.expected_cash := coalesce(new.deliveries_total, 0) + coalesce(new.change_fund, 0)
      - coalesce(new.tolls_total, 0) - coalesce(new.extraordinary_total, 0) - v_included_total;
    new.difference := coalesce(new.counted_cash, 0) + coalesce(new.shortage_recovered, 0) - new.expected_cash;
  end if;
  return new;
end;
$$;

drop trigger if exists treasury_settlement_electronic_total on public.treasury_settlements;
create trigger treasury_settlement_electronic_total
before update on public.treasury_settlements
for each row execute function public.recalculate_treasury_settlement_electronic_total();

-- Recalculate only open drafts. Confirmed records are left as historical entries.
update public.treasury_settlements
set updated_at = updated_at
where status = 'draft' and route_sheet_id is not null;

commit;
