begin;
create table if not exists public.mp_refresh_monitors (
 account_id text primary key references public.mp_accounts(id) on delete cascade,
 last_seen_at timestamptz not null default now()
);
create table if not exists public.mp_refresh_requests (
 id uuid primary key default gen_random_uuid(),
 account_id text not null references public.mp_accounts(id) on delete cascade,
 requested_by uuid not null,
 created_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','reading','completed','failed','offline','expired')),
 claimed_at timestamptz, completed_at timestamptz, message text
);
create index if not exists mp_refresh_pending on public.mp_refresh_requests(account_id,created_at) where status in ('queued','reading');
alter table public.mp_refresh_requests enable row level security;
alter table public.mp_refresh_monitors enable row level security;
revoke all on public.mp_refresh_requests,public.mp_refresh_monitors from anon,authenticated;
grant all on public.mp_refresh_requests,public.mp_refresh_monitors to service_role;
create or replace function public.request_mp_refresh(p_account text,p_user uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.mp_refresh_requests; online boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('mp-refresh:'||p_account,0));
 if not exists(select 1 from mp_accounts where id=p_account and is_active) then raise exception 'Cuenta no disponible'; end if;
 update mp_refresh_requests set status='expired',completed_at=now(),message='El monitor no respondió a tiempo'
 where account_id=p_account and status in ('queued','reading') and created_at<now()-interval '90 seconds';
 select * into r from mp_refresh_requests where account_id=p_account and status in ('queued','reading') order by created_at desc limit 1;
 if found then return to_jsonb(r); end if;
 -- Reutilizar lecturas recientes evita clics simultáneos y ráfagas al monitor.
 select * into r from mp_refresh_requests where account_id=p_account and created_at>now()-interval '10 seconds' order by created_at desc limit 1;
 if found then return to_jsonb(r); end if;
 select exists(select 1 from mp_refresh_monitors where account_id=p_account and last_seen_at>now()-interval '35 seconds') into online;
 insert into mp_refresh_requests(account_id,requested_by,status,message)
 values(p_account,p_user,case when online then 'queued' else 'offline' end,case when online then 'Esperando al monitor' else 'Monitor desconectado. Abrí Actividad con la extensión activa.' end) returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.poll_mp_refresh(p_account text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.mp_refresh_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('mp-refresh:'||p_account,0));
 if not exists(select 1 from mp_accounts where id=p_account and is_active) then raise exception 'Cuenta no disponible'; end if;
 insert into mp_refresh_monitors(account_id) values(p_account) on conflict(account_id) do update set last_seen_at=now();
 update mp_refresh_requests set status='expired',completed_at=now(),message='El monitor no respondió a tiempo' where account_id=p_account and status in ('queued','reading') and created_at<now()-interval '90 seconds';
 select * into r from mp_refresh_requests where account_id=p_account and status='queued' order by created_at limit 1 for update;
 if not found then return null; end if;
 update mp_refresh_requests set status='reading',claimed_at=now(),message='Leyendo Mercado Pago' where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.complete_mp_refresh(p_account text,p_id uuid,p_ok boolean,p_message text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update mp_refresh_requests set status=case when p_ok then 'completed' else 'failed' end,completed_at=now(),message=left(p_message,300)
 where id=p_id and account_id=p_account and status='reading' and created_at>now()-interval '90 seconds';
 return found;
end $$;
revoke all on function public.request_mp_refresh(text,uuid),public.poll_mp_refresh(text),public.complete_mp_refresh(text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.request_mp_refresh(text,uuid),public.poll_mp_refresh(text),public.complete_mp_refresh(text,uuid,boolean,text) to service_role;
commit;
