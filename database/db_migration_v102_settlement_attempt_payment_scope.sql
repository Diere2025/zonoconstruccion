begin;

-- Shared SQL equivalent of settlementDeliveryStatus: retain the outcome of
-- this attempt even if a generic order sync changed status to pendiente_ruteo.
create or replace function public.settlement_delivery_status(p_status text, p_failure_reason text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when lower(trim(coalesce(p_status, ''))) in ('entregado', 'entregada') then p_status
    when lower(coalesce(p_failure_reason, '')) ~ '(postergad|anulad|cancelad|no entregad|fallid|pendiente[_ ]ruteo)' then p_failure_reason
    else coalesce(p_status, '') end;
$$;

create or replace function public.recalculate_treasury_settlement_electronic_total()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket_count integer; v_included_total numeric;
begin
  if new.status = 'archived' or new.route_sheet_id is null then return new; end if;

  select count(*), coalesce(sum(t.amount) filter (where not exists (
    select 1 from public.deliveries d
    join public.orders o on o.id = d.order_id
    left join public.mp_payments p on p.id::text = t.mp_payment_id
    where d.route_sheet_id = new.route_sheet_id and (
      t.order_id = o.id
      or (nullif(trim(t.order_code), '') is not null and upper(trim(t.order_code)) = upper(trim(o.legacy_code)))
      or p.order_id = o.id
      or (nullif(trim(p.order_code), '') is not null and upper(trim(p.order_code)) = upper(trim(o.legacy_code)))
    ) and (
      lower(public.settlement_delivery_status(d.status, d.failure_reason))
        ~ '(postergad|anulad|cancelad|no entregad|fallid|pendiente[_ ]ruteo)'
    )
  )), 0) into v_ticket_count, v_included_total
  from public.treasury_settlement_electronic_tickets t where t.settlement_id = new.id;

  -- Never infer identity from a matching amount, or rewrite ticket/payment
  -- history. Anonymous legacy tickets remain included until linked explicitly.
  if v_ticket_count > 0 then
    new.electronic_total := v_included_total;
    new.expected_cash := coalesce(new.deliveries_total, 0) + coalesce(new.change_fund, 0)
      - coalesce(new.tolls_total, 0) - coalesce(new.extraordinary_total, 0) - v_included_total;
    new.difference := coalesce(new.counted_cash, 0) + coalesce(new.shortage_recovered, 0) - new.expected_cash;
    if new.difference is distinct from old.difference then
      -- An old generated 'dio OK' message must not survive a changed balance.
      new.whatsapp_message := null;
    end if;
  end if;
  return new;
end;
$$;

-- Do not wait for a user to re-save after a logistics synchronization.
create or replace function public.refresh_settlement_after_delivery_outcome()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.status, new.failure_reason, new.route_sheet_id)
     is distinct from (old.status, old.failure_reason, old.route_sheet_id) then
    update public.treasury_settlements set updated_at = now()
    where status <> 'archived' and route_sheet_id in (old.route_sheet_id, new.route_sheet_id);
  end if;
  return new;
end;
$$;
drop trigger if exists settlement_delivery_outcome_changed on public.deliveries;
create trigger settlement_delivery_outcome_changed after update of status, failure_reason, route_sheet_id
  on public.deliveries for each row execute function public.refresh_settlement_after_delivery_outcome();

-- General correction, not a special case for a particular order. Keep count,
-- expenses, original payments and posted cash movements unchanged.
update public.treasury_settlements set updated_at = updated_at
where status <> 'archived' and route_sheet_id is not null;

notify pgrst, 'reload schema';
commit;
