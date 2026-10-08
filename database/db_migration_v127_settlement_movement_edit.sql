begin;

-- Administración already manages renditions, but the general cash UPDATE
-- policy only allows admins. Grant UPDATE only for movements linked to them.
drop policy if exists treasury_managers_update_settlement_movements on public.cash_transactions;
create policy treasury_managers_update_settlement_movements
  on public.cash_transactions for update to authenticated
  using (
    treasury_settlement_id is not null
    and public.can_manage_treasury_settlements(auth.uid())
  )
  with check (
    treasury_settlement_id is not null
    and public.can_manage_treasury_settlements(auth.uid())
  );

alter table public.treasury_settlements
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null;

create or replace function public.reopen_treasury_settlement(p_actor_id uuid, p_settlement_id uuid)
returns public.treasury_settlements language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_settlement public.treasury_settlements;
begin
  if not public.can_manage_treasury_settlements(p_actor_id) then
    raise exception 'No tenés permisos para gestionar rendiciones.' using errcode = '42501';
  end if;
  select * into strict v_settlement from public.treasury_settlements
    where id = p_settlement_id for update;
  if v_settlement.status <> 'confirmed' then
    raise exception 'Sólo se pueden reabrir rendiciones confirmadas.' using errcode = '23514';
  end if;
  update public.treasury_settlements set status = 'draft',
    reopened_at = clock_timestamp(), reopened_by = p_actor_id,
    updated_at = clock_timestamp()
    where id = p_settlement_id returning * into v_settlement;
  return v_settlement;
end;
$$;
revoke all on function public.reopen_treasury_settlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reopen_treasury_settlement(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
