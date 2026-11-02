begin;
create table if not exists public.scheduled_sheet_sync_runs (
 id uuid primary key default gen_random_uuid(), run_key text not null unique,
 dry_run boolean not null default false,
 status text not null default 'running' check(status in ('running','completed','failed')),
 step text not null default 'Iniciando', summary jsonb not null default '{}', error text,
 started_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), finished_at timestamptz
);
create table if not exists public.scheduled_sheet_sync_lease (
 singleton boolean primary key default true check(singleton), run_id uuid references public.scheduled_sheet_sync_runs(id), expires_at timestamptz
);
insert into public.scheduled_sheet_sync_lease(singleton) values(true) on conflict do nothing;
alter table public.scheduled_sheet_sync_runs enable row level security;
alter table public.scheduled_sheet_sync_lease enable row level security;
revoke all on public.scheduled_sheet_sync_runs,public.scheduled_sheet_sync_lease from public,anon,authenticated;
grant select on public.scheduled_sheet_sync_runs to service_role;

-- A dedicated credential authorizes only these four bookkeeping RPCs. Never
-- distribute the service-role key to the scheduled worker.
create table if not exists public.scheduled_sheet_sync_auth (
 singleton boolean primary key default true check(singleton), token_hash text not null check(length(token_hash)=64)
);
alter table public.scheduled_sheet_sync_auth enable row level security;
revoke all on public.scheduled_sheet_sync_auth from public,anon,authenticated;
create or replace function public.require_scheduled_sheet_sync_token(p_token text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_token is null or not exists(select 1 from scheduled_sheet_sync_auth where singleton and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then
  raise exception 'Credencial de sincronización inválida.' using errcode='42501';
 end if;
end $$;
revoke all on function public.require_scheduled_sheet_sync_token(text) from public,anon,authenticated;

-- Remove the initial service-role-only signatures if installed previously.
drop function if exists public.claim_scheduled_sheet_sync(text,boolean);
drop function if exists public.update_scheduled_sheet_sync(uuid,text,jsonb);
drop function if exists public.finish_scheduled_sheet_sync(uuid,boolean,jsonb,text);
drop function if exists public.get_scheduled_sheet_sync_status();

create or replace function public.claim_scheduled_sheet_sync(p_token text,p_key text,p_dry_run boolean default false) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_lease scheduled_sheet_sync_lease;
begin
 perform require_scheduled_sheet_sync_token(p_token);
 if p_key is null or length(p_key)>150 or length(p_key)<1 then raise exception 'Clave inválida.';end if;
 select * into v_lease from scheduled_sheet_sync_lease where singleton for update;
 if v_lease.expires_at>clock_timestamp() then return null;end if;
 if exists(select 1 from scheduled_sheet_sync_runs where run_key=p_key) then return null;end if;
 -- Respect legacy background jobs; the current browser importer is independent.
 if to_regclass('public.import_jobs') is not null then
   if exists(select 1 from public.import_jobs where status='running' and updated_at>clock_timestamp()-interval '20 minutes') then return null;end if;
 end if;
 update scheduled_sheet_sync_runs set status='failed',step='Interrumpido',error='La ejecución perdió su plazo sin registrar el cierre.',finished_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_lease.run_id and status='running';
 insert into scheduled_sheet_sync_runs(run_key,dry_run) values(p_key,p_dry_run) returning id into v_id;
 update scheduled_sheet_sync_lease set run_id=v_id,expires_at=clock_timestamp()+interval '20 minutes' where singleton;
 return v_id;
end $$;

create or replace function public.update_scheduled_sheet_sync(p_token text,p_id uuid,p_step text,p_summary jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_scheduled_sheet_sync_token(p_token);
 perform 1 from scheduled_sheet_sync_lease where singleton and run_id=p_id and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Se perdió el turno de sincronización.';end if;
 update scheduled_sheet_sync_runs set step=left(p_step,200),summary=p_summary,updated_at=clock_timestamp() where id=p_id and status='running';
 if not found then raise exception 'La sincronización ya no está en curso.';end if;
end $$;

create or replace function public.finish_scheduled_sheet_sync(p_token text,p_id uuid,p_success boolean,p_summary jsonb,p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_scheduled_sheet_sync_token(p_token);
 perform 1 from scheduled_sheet_sync_lease where singleton and run_id=p_id and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Se perdió el turno de sincronización.';end if;
 update scheduled_sheet_sync_runs set status=case when p_success then 'completed' else 'failed' end,
 step=case when p_success then case when dry_run then 'Verificación completada sin cambios' else 'Completado' end else 'Interrumpido' end,
 summary=p_summary,error=case when p_success then null else left(p_error,1000) end,updated_at=clock_timestamp(),finished_at=clock_timestamp()
 where id=p_id and status='running';
 if not found then raise exception 'La sincronización ya terminó.';end if;
 -- On failures retain the lease: an HTTP timeout can leave an ERP request
 -- finishing in the background. Do not immediately launch another writer.
 if p_success or exists(select 1 from scheduled_sheet_sync_runs where id=p_id and dry_run) then
  update scheduled_sheet_sync_lease set run_id=null,expires_at=null where singleton and run_id=p_id;
 end if;
end $$;

-- A failed preview issued no business writes and needs no writer cooldown.
update scheduled_sheet_sync_lease l set run_id=null,expires_at=null
from scheduled_sheet_sync_runs r where l.singleton and l.run_id=r.id and r.dry_run and r.status='failed';

create or replace function public.get_scheduled_sheet_sync_status(p_token text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_scheduled_sheet_sync_token(p_token);
 return (select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]'::jsonb) from
 (select * from scheduled_sheet_sync_runs order by started_at desc limit 20) r);
end;
$$;
revoke all on function public.claim_scheduled_sheet_sync(text,text,boolean),public.update_scheduled_sheet_sync(text,uuid,text,jsonb),public.finish_scheduled_sheet_sync(text,uuid,boolean,jsonb,text),public.get_scheduled_sheet_sync_status(text) from public,anon,authenticated;
grant execute on function public.claim_scheduled_sheet_sync(text,text,boolean),public.update_scheduled_sheet_sync(text,uuid,text,jsonb),public.finish_scheduled_sheet_sync(text,uuid,boolean,jsonb,text),public.get_scheduled_sheet_sync_status(text) to anon,service_role;

-- The ERP checks this capability in its existing importer. It never provides
-- a general administrator session or grants the worker direct table access.
create or replace function public.authorize_scheduled_sheet_import(p_token text,p_id uuid,p_source text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform require_scheduled_sheet_sync_token(p_token);
 return exists(select 1 from scheduled_sheet_sync_runs r join scheduled_sheet_sync_lease l on l.run_id=r.id and l.singleton
 where r.id=p_id and not r.dry_run and r.status='running' and l.expires_at>clock_timestamp() and r.step='Pedidos: '||p_source
 and p_source in ('Jazmín Sánchez','Diego Bóveda','Ludmila Krenz','Facundo Paz','Central/Ruteo'));
end $$;
revoke all on function public.authorize_scheduled_sheet_import(text,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_scheduled_sheet_import(text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
