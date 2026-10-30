begin;

-- Access to ERP screens. Data/RPC permissions remain under their existing policies.
create table if not exists public.erp_role_screen_access (
  id boolean primary key default true check (id),
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  revision integer not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.erp_role_screen_access(id) values (true) on conflict do nothing;
create table if not exists public.erp_role_screen_access_audit (
  id bigint generated always as identity primary key,
  revision integer not null,
  previous_overrides jsonb not null,
  overrides jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.erp_role_screen_access enable row level security;
alter table public.erp_role_screen_access_audit enable row level security;
revoke all on public.erp_role_screen_access, public.erp_role_screen_access_audit from public, anon, authenticated;
grant all on public.erp_role_screen_access, public.erp_role_screen_access_audit to service_role;
grant usage, select on sequence public.erp_role_screen_access_audit_id_seq to service_role;

create or replace function public.save_erp_role_screen_access(p_overrides jsonb, p_revision integer, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_row public.erp_role_screen_access; result_row public.erp_role_screen_access;
begin
  select * into strict current_row from public.erp_role_screen_access where id = true for update;
  if current_row.revision <> p_revision then
    raise exception 'La configuración cambió. Recargá antes de guardar.' using errcode = '40001';
  end if;
  update public.erp_role_screen_access set overrides = p_overrides, revision = revision + 1,
    updated_by = p_actor, updated_at = now() where id = true returning * into result_row;
  insert into public.erp_role_screen_access_audit(revision, previous_overrides, overrides, updated_by)
    values (result_row.revision, current_row.overrides, p_overrides, p_actor);
  return to_jsonb(result_row);
end;
$$;
revoke all on function public.save_erp_role_screen_access(jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.save_erp_role_screen_access(jsonb, integer, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
