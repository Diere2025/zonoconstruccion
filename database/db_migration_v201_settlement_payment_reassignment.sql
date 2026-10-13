begin;

-- Reassignment and settlement save share one transaction. Untouched links are
-- deliberately left alone, including when another user corrected them meanwhile.
create table if not exists public.treasury_settlement_payment_reassignments (
  id bigint generated always as identity primary key,
  settlement_id uuid references public.treasury_settlements(id) on delete set null,
  payment_id text not null,
  actor_id uuid not null references auth.users(id),
  previous_order_id uuid,
  previous_order_code text,
  order_id uuid not null,
  order_code text not null,
  created_at timestamptz not null default now()
);
alter table public.treasury_settlement_payment_reassignments enable row level security;
revoke all on public.treasury_settlement_payment_reassignments from anon, authenticated;
grant select on public.treasury_settlement_payment_reassignments to authenticated;
grant all on public.treasury_settlement_payment_reassignments to service_role;
drop policy if exists treasury_managers_read_payment_reassignments on public.treasury_settlement_payment_reassignments;
create policy treasury_managers_read_payment_reassignments
  on public.treasury_settlement_payment_reassignments for select to authenticated
  using (public.can_manage_treasury_settlements());

create or replace function public.save_treasury_settlement_with_payment_links(
  p_save jsonb, p_delivery_statuses jsonb, p_reassignments jsonb
) returns public.treasury_settlements language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_settlement public.treasury_settlements;
  v_payment public.mp_payments;
  v_change jsonb;
  v_actor uuid := (p_save->>'p_actor_id')::uuid;
  v_order_id uuid;
  v_code text;
  v_actor_name text;
begin
  if not public.can_manage_treasury_settlements(v_actor) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;
  select * into strict v_settlement from public.treasury_settlements
    where id = (p_save->>'p_settlement_id')::uuid for update;
  if v_settlement.status <> 'draft' then
    raise exception 'Reabrí la rendición para corregir el pedido del pago.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_reassignments) r
    group by r->>'payment_id' having count(*) > 1) then
    raise exception 'El mismo pago no puede reasignarse a más de un pedido.';
  end if;
  select coalesce(s.full_name, u.email, 'Administración') into v_actor_name
    from auth.users u left join public.sellers s on s.id = u.id
    where u.id = v_actor;

  for v_change in select value from jsonb_array_elements(p_reassignments) order by value->>'payment_id' loop
    v_order_id := nullif(v_change->>'order_id', '')::uuid;
    v_code := upper(trim(v_change->>'order_code'));
    if v_order_id is null or coalesce(v_code, '') = '' then
      raise exception 'Seleccioná el pedido correcto del recorrido para este pago.';
    end if;
    select * into v_payment from public.mp_payments
      where id::text = v_change->>'payment_id' for update;
    if not found then raise exception 'El pago vinculado ya no está disponible.'; end if;

    -- A caller cannot use a settlement to change an unrelated payment.
    if not exists (select 1 from public.treasury_settlement_electronic_tickets t
      where t.settlement_id = v_settlement.id and t.mp_payment_id = v_payment.id::text)
      and not exists (select 1 from public.deliveries d join public.orders o on o.id = d.order_id
        where d.route_sheet_id = v_settlement.route_sheet_id and
          (v_payment.order_id = o.id or exists (
            select 1 from regexp_split_to_table(coalesce(o.legacy_code, ''), '[/,]') c
            where upper(trim(c)) = upper(trim(v_payment.order_code))))) then
      raise exception 'El pago no pertenece a esta rendición.';
    end if;
    if v_payment.order_id is distinct from nullif(v_change->>'previous_order_id', '')::uuid
      or nullif(upper(trim(v_payment.order_code)), '') is distinct from nullif(upper(trim(v_change->>'previous_order_code')), '') then
      raise exception 'Otro usuario modificó el pedido de este pago. Actualizá la rendición antes de corregirlo.' using errcode = '40001';
    end if;
    if not exists (select 1 from public.deliveries d join public.orders o on o.id = d.order_id
      where d.route_sheet_id = v_settlement.route_sheet_id and o.id = v_order_id
        and exists (select 1 from regexp_split_to_table(coalesce(o.legacy_code, ''), '[/,]') c where upper(trim(c)) = v_code)) then
      raise exception 'El pedido seleccionado no pertenece al recorrido de esta rendición.';
    end if;
    if (select count(*) from jsonb_array_elements(p_save->'p_electronic_tickets') t
      where t->>'mp_payment_id' = v_payment.id::text) <> 1
      or not exists (select 1 from jsonb_array_elements(p_save->'p_electronic_tickets') t
        where t->>'mp_payment_id' = v_payment.id::text and (t->>'order_id')::uuid = v_order_id
          and upper(trim(t->>'order_code')) = v_code and (t->>'amount')::numeric > 0) then
      raise exception 'La asignación del ticket no coincide con la corrección del pago.';
    end if;
    insert into public.treasury_settlement_payment_reassignments
      (settlement_id, payment_id, actor_id, previous_order_id, previous_order_code, order_id, order_code)
      values (v_settlement.id, v_payment.id::text, v_actor, v_payment.order_id, v_payment.order_code, v_order_id, v_code);
    update public.mp_payments set order_id = v_order_id, order_code = v_code,
      linked_by = v_actor_name, linked_at = now() where id = v_payment.id;
  end loop;
  -- A failed save rolls back payment updates and their audit records too.
  select * into v_settlement from public.save_treasury_settlement_with_orders(p_save, p_delivery_statuses);
  return v_settlement;
end;
$$;
revoke all on function public.save_treasury_settlement_with_payment_links(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_treasury_settlement_with_payment_links(jsonb, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
