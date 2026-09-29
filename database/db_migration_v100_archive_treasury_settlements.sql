begin;

alter table public.treasury_settlements
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;
alter table public.treasury_settlements drop constraint if exists treasury_settlements_status_check;
alter table public.treasury_settlements add constraint treasury_settlements_status_check
  check (status in ('draft', 'confirmed', 'archived'));
alter table public.treasury_settlements drop constraint if exists treasury_settlements_archive_reason_check;
alter table public.treasury_settlements add constraint treasury_settlements_archive_reason_check
  check (status <> 'archived' or (archived_at is not null and coalesce(length(trim(archive_reason)), 0) between 1 and 1000));

-- Retain the original route for history, while allowing a new active rendition.
alter table public.treasury_settlements drop constraint if exists treasury_settlements_route_sheet_id_key;
create unique index if not exists treasury_settlements_active_route
  on public.treasury_settlements(route_sheet_id) where status <> 'archived';
drop index if exists public.idx_treasury_settlements_source_row;
create unique index idx_treasury_settlements_source_row
  on public.treasury_settlements(source_spreadsheet_id, source_row)
  where source_spreadsheet_id is not null and source_row is not null and status <> 'archived';

alter table public.treasury_settlement_payment_links add column if not exists archived_at timestamptz;
alter table public.treasury_settlement_payment_links drop constraint if exists treasury_settlement_payment_links_client_payment_id_key;
create unique index if not exists treasury_settlement_active_payment
  on public.treasury_settlement_payment_links(client_payment_id) where archived_at is null;

create or replace function public.is_treasury_settlement_admin(p_actor_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from auth.users u left join public.sellers s
      on s.id = u.id or lower(s.email) = lower(u.email)
    where u.id = p_actor_id and coalesce(s.is_active, true)
      and (lower(u.email) in ('diego.boveda@gmail.com', 'caroibarra.93@gmail.com')
        or s.role = 'admin' or coalesce(s.roles, '{}'::text[]) @> array['admin']::text[])
  );
$$;

-- Run first, before balance recalculation, so archiving preserves the saved values.
create or replace function public.guard_archived_treasury_settlement()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'archived' and new is distinct from old then
    raise exception 'La rendición está archivada y no admite cambios.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists treasury_settlement_archive_guard on public.treasury_settlements;
create trigger treasury_settlement_archive_guard before update on public.treasury_settlements
  for each row execute function public.guard_archived_treasury_settlement();

-- Migration v99 owns this balance trigger. Extend its early return for archived rows.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.recalculate_treasury_settlement_electronic_total()'::regprocedure) into definition;
  if position('if new.status = ''archived''' in definition) > 0 then
    return;
  end if;
  if position('if new.route_sheet_id is null or old.status' in definition) = 0 then
    raise exception 'No se pudo localizar la protección de la función de cálculo de rendiciones.';
  end if;
  execute replace(definition, 'if new.route_sheet_id is null or old.status',
    'if new.status = ''archived'' or old.status = ''archived'' or new.route_sheet_id is null or old.status');
end;
$$;

-- The older route RPC must infer the new partial unique index as well.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_treasury_settlement(uuid,uuid,numeric,numeric,text,text,jsonb,jsonb,jsonb,boolean)'::regprocedure) into definition;
  execute replace(definition, 'on conflict (route_sheet_id) do update',
    'on conflict (route_sheet_id) where status <> ''archived'' do update');
end;
$$;

create or replace function public.archive_treasury_settlement(p_actor_id uuid, p_settlement_id uuid, p_reason text)
returns public.treasury_settlements language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.treasury_settlements;
begin
  if not public.can_manage_treasury_settlements(p_actor_id) then
    raise exception 'No tenés permisos para dar de baja rendiciones.' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_reason)), 0) not between 1 and 1000 then
    raise exception 'El motivo de baja es obligatorio (hasta 1.000 caracteres).';
  end if;
  select * into result from public.treasury_settlements where id = p_settlement_id for update;
  if not found then raise exception 'La rendición no existe.'; end if;
  if result.status = 'archived' then raise exception 'La rendición ya está archivada.'; end if;
  update public.treasury_settlements set status = 'archived', archive_reason = trim(p_reason),
    archived_at = now(), archived_by = p_actor_id, updated_at = now()
    where id = p_settlement_id returning * into result;
  update public.treasury_settlement_payment_links set archived_at = result.archived_at
    where settlement_id = p_settlement_id;
  return result;
end;
$$;

create or replace function public.delete_archived_treasury_settlement(p_actor_id uuid, p_settlement_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare archived public.treasury_settlements;
begin
  if not public.is_treasury_settlement_admin(p_actor_id) then
    raise exception 'Sólo un administrador puede eliminar rendiciones archivadas.' using errcode = '42501';
  end if;
  select * into archived from public.treasury_settlements where id = p_settlement_id for update;
  if not found then raise exception 'La rendición no existe.'; end if;
  if archived.status <> 'archived' then raise exception 'Primero debés dar de baja la rendición.'; end if;
  delete from public.treasury_settlements where id = p_settlement_id;
  return p_settlement_id;
end;
$$;

revoke all on function public.is_treasury_settlement_admin(uuid) from public;
revoke all on function public.archive_treasury_settlement(uuid, uuid, text) from public;
revoke all on function public.delete_archived_treasury_settlement(uuid, uuid) from public;
grant execute on function public.archive_treasury_settlement(uuid, uuid, text) to service_role;
grant execute on function public.delete_archived_treasury_settlement(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
