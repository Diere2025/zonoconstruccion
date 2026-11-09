begin;

alter table public.treasury_settlements add column if not exists no_collection jsonb
  not null default '{"orders": {}, "total": 0}'::jsonb;
alter table public.deliveries add column if not exists settlement_sheet_collection jsonb;

-- Keep payment evidence in the settlement while excluding it from the driver's balance.
do $$
declare
  definition text;
  anchor text := 'lower(public.settlement_delivery_status(d.status, d.failure_reason))';
begin
  select pg_get_functiondef('public.recalculate_treasury_settlement_electronic_total()'::regprocedure) into definition;
  if position('new.no_collection' in definition) = 0 then
    if position(anchor in definition) = 0 then
      raise exception 'No se encontró el cálculo de cobros electrónicos de rendiciones.';
    end if;
    execute replace(definition, anchor,
      '(new.no_collection->''orders''->d.id::text) = ''true''::jsonb or ' || anchor);
  end if;
end;
$$;

create or replace function public.save_treasury_settlement_with_collection_terms(
  p_save jsonb, p_delivery_statuses jsonb, p_reassignments jsonb, p_collection jsonb, p_previous jsonb
) returns public.treasury_settlements language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_settlement public.treasury_settlements;
  v_orders jsonb := p_collection->'orders';
  v_total numeric := (p_collection->>'total')::numeric;
begin
  if not public.can_manage_treasury_settlements((p_save->>'p_actor_id')::uuid) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;
  select * into strict v_settlement from public.treasury_settlements
    where id = (p_save->>'p_settlement_id')::uuid for update;
  if v_settlement.status <> 'draft' then
    raise exception 'La rendición no admite cambios.';
  end if;
  if v_settlement.no_collection is distinct from p_previous then
    raise exception 'Cambió la condición de cobro. Actualizá la rendición antes de guardar.' using errcode = '40001';
  end if;
  if jsonb_typeof(v_orders) is distinct from 'object' or v_total is null or v_total < 0 then
    raise exception 'Condición de cobro inválida.';
  end if;
  if exists (
    select 1 from jsonb_each(v_orders) o
    where jsonb_typeof(o.value) <> 'boolean' or not exists (
      select 1 from public.deliveries d
      where d.id::text = o.key and d.route_sheet_id = v_settlement.route_sheet_id
    )
  ) or (v_total > 0 and not exists (select 1 from jsonb_each(v_orders) o where o.value = 'true'::jsonb)) then
    raise exception 'La condición de cobro no corresponde a los pedidos de esta rendición.';
  end if;

  if v_settlement.no_collection is distinct from p_collection then
    update public.treasury_settlements set no_collection = p_collection where id = v_settlement.id;
  end if;
  if jsonb_array_length(p_reassignments) > 0 then
    return public.save_treasury_settlement_with_payment_links(p_save, p_delivery_statuses, p_reassignments);
  end if;
  return public.save_treasury_settlement_with_orders(p_save, p_delivery_statuses);
end;
$$;

revoke all on function public.save_treasury_settlement_with_collection_terms(jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_treasury_settlement_with_collection_terms(jsonb,jsonb,jsonb,jsonb,jsonb)
  to service_role;
notify pgrst, 'reload schema';
commit;
