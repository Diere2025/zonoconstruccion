begin;

alter table public.cash_transactions
  add column if not exists registered_at timestamptz,
  add column if not exists treasury_settlement_id uuid references public.treasury_settlements(id) on delete set null;
update public.cash_transactions set registered_at = created_at where registered_at is null;
alter table public.cash_transactions alter column registered_at set default clock_timestamp();
alter table public.cash_transactions alter column registered_at set not null;
alter table public.treasury_settlements add column if not exists movements_generated_at timestamptz;
create index if not exists cash_transactions_treasury_settlement on public.cash_transactions(treasury_settlement_id);

-- Link historical movements by their exact generated prefix, not partial codes.
update public.cash_transactions t set treasury_settlement_id = s.id
from public.treasury_settlements s
where t.treasury_settlement_id is null
  and starts_with(t.notes, 'Rendición ' || s.code || ' (')
  and (select count(*) from public.treasury_settlements other where other.code = s.code) = 1;
update public.treasury_settlements s set movements_generated_at = m.generated_at
from (select treasury_settlement_id, max(registered_at) generated_at from public.cash_transactions
  where treasury_settlement_id is not null group by treasury_settlement_id) m
where s.id = m.treasury_settlement_id and s.status <> 'archived' and s.movements_generated_at is null;

create or replace function public.generate_treasury_settlement_movements(
  p_actor_id uuid, p_settlement_id uuid, p_mode text, p_previous_ids uuid[], p_movements jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settlement public.treasury_settlements;
  v_ids uuid[];
  v_expected uuid[];
  v_result jsonb;
begin
  if not public.can_manage_treasury_settlements(p_actor_id) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;
  select * into strict v_settlement from public.treasury_settlements where id = p_settlement_id for update;
  if v_settlement.status = 'archived' then raise exception 'La rendición está archivada.'; end if;
  if p_mode not in ('initial', 'replace', 'duplicate') or p_mode is null then raise exception 'Elegí cómo generar los movimientos.'; end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_ids
    from public.cash_transactions where treasury_settlement_id = p_settlement_id;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_expected from unnest(p_previous_ids) id;
  if v_ids <> v_expected then
    raise exception 'Los movimientos cambiaron. Cerrá y volvé a abrir la rendición para revisar los movimientos actuales.';
  end if;
  if cardinality(v_ids) > 0 and p_mode = 'initial' then
    raise exception 'Los movimientos ya fueron generados. Elegí reemplazar, duplicar o cancelar.';
  end if;
  if jsonb_typeof(p_movements) <> 'array' or jsonb_array_length(p_movements) = 0 then
    raise exception 'No hay movimientos para registrar.';
  end if;
  if p_mode = 'replace' then
    -- Prevent replacing reconciled movements and losing their payment links.
    if exists (select 1 from public.client_payments where cash_transaction_id = any(v_ids))
      or exists (select 1 from public.supplier_payments where cash_transaction_id = any(v_ids)) then
      raise exception 'Hay movimientos vinculados a pagos. Desvinculalos en Finanzas antes de reemplazarlos.';
    end if;
    delete from public.cash_transactions where id = any(v_ids);
  end if;
  with inserted as (
    insert into public.cash_transactions (
      type, category, sub_category, amount, currency, payment_method_id, financial_account_id,
      concept, notes, business_unit, route_sheet_id, created_by, created_at, treasury_settlement_id
    ) select m.type, m.category, m.sub_category, m.amount, m.currency, m.payment_method_id, m.financial_account_id,
      m.concept, m.notes, m.business_unit, v_settlement.route_sheet_id, p_actor_id, m.created_at, p_settlement_id
    from jsonb_populate_recordset(null::public.cash_transactions, p_movements) m
    returning id, concept, amount, type, created_at, category, financial_account_id
  ) select coalesce(jsonb_agg(inserted), '[]'::jsonb) into v_result from inserted;
  update public.treasury_settlements set movements_generated_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_settlement_id;
  return v_result;
end;
$$;
revoke all on function public.generate_treasury_settlement_movements(uuid, uuid, text, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.generate_treasury_settlement_movements(uuid, uuid, text, uuid[], jsonb) to service_role;

-- Persist the rendition and its manually selected delivery states atomically.
create or replace function public.save_treasury_settlement_with_orders(p_save jsonb, p_delivery_statuses jsonb)
returns public.treasury_settlements language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settlement public.treasury_settlements;
  v_item jsonb;
  v_status text;
  v_route_id uuid;
begin
  if not public.can_manage_treasury_settlements((p_save->>'p_actor_id')::uuid) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;
  if nullif(p_save->>'p_settlement_id', '') is not null then
    select * into strict v_settlement from public.treasury_settlements
      where id = (p_save->>'p_settlement_id')::uuid for update;
    v_route_id := v_settlement.route_sheet_id;
    if v_settlement.status <> 'draft' then raise exception 'La rendición no admite cambios.'; end if;
    for v_item in select value from jsonb_array_elements(coalesce(p_delivery_statuses, '[]'::jsonb)) loop
      v_status := lower(trim(v_item->>'status'));
      if v_status in ('en recorrido', 'entregando') then v_status := 'en_recorrido'; end if;
      if v_status = 'fallido' then v_status := 'no entregado'; end if;
      if v_status not in ('en_recorrido', 'entregado', 'postergado', 'anulado', 'cancelado', 'no entregado', 'pendiente_ruteo') or v_status is null then
        raise exception 'Estado de pedido inválido: %', v_status;
      end if;
      update public.deliveries set
        status = case when v_status in ('postergado', 'anulado', 'cancelado', 'no entregado') then 'fallido' else v_status end,
        failure_reason = case when v_status in ('postergado', 'anulado', 'cancelado', 'no entregado') then v_status else null end
        where id = (v_item->>'deliveryId')::uuid and route_sheet_id = v_route_id;
      if not found then raise exception 'El pedido no pertenece a esta rendición.'; end if;
    end loop;
  end if;
  select * into v_settlement from public.save_manual_treasury_settlement(
    (p_save->>'p_actor_id')::uuid, (p_save->>'p_settlement_id')::uuid,
    p_save->>'p_code', (p_save->>'p_settlement_date')::date, p_save->>'p_carrier_name', p_save->>'p_route_detail',
    (p_save->>'p_deliveries_total')::numeric, (p_save->>'p_electronic_total')::numeric,
    (p_save->>'p_change_fund')::numeric, (p_save->>'p_shortage_recovered')::numeric,
    p_save->>'p_notes', p_save->>'p_whatsapp_message', (p_save->>'p_count_date')::date,
    (p_save->>'p_counted_cash_override')::numeric, p_save->'p_expenses', p_save->'p_cash_counts',
    (p_save->>'p_confirm')::boolean, p_save->'p_electronic_tickets'
  );
  if v_route_id is not null then
    update public.route_sheets set total_theoretical_cash = v_settlement.deliveries_total where id = v_route_id;
  end if;
  return v_settlement;
end;
$$;
revoke all on function public.save_treasury_settlement_with_orders(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_treasury_settlement_with_orders(jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
