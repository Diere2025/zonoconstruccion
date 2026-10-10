begin;
create table if not exists public.mp_capture_refresh_monitors (
 account_id text not null references public.mp_accounts(id),channel text not null check(channel in ('activity','banking')),
 last_seen_at timestamptz not null default now(),primary key(account_id,channel)
);
create table if not exists public.mp_capture_refresh_requests (
 id uuid primary key default gen_random_uuid(),account_id text not null references public.mp_accounts(id),channel text not null check(channel in ('activity','banking')),
 requested_by uuid not null references auth.users(id),created_at timestamptz not null default now(),claimed_at timestamptz,completed_at timestamptz,
 status text not null check(status in ('queued','reading','completed','failed','offline','expired')),message text not null,
 history boolean not null default false,date_from date not null default '2026-10-01',date_to date not null default current_date,
 check(date_from>='2026-10-01' and date_to>=date_from and date_to-date_from<=31)
);
create index if not exists mp_capture_refresh_pending on public.mp_capture_refresh_requests(account_id,channel,created_at) where status in ('queued','reading');
alter table public.mp_capture_refresh_monitors enable row level security;alter table public.mp_capture_refresh_requests enable row level security;
revoke all on public.mp_capture_refresh_monitors,public.mp_capture_refresh_requests from public,anon,authenticated;
grant all on public.mp_capture_refresh_monitors,public.mp_capture_refresh_requests to service_role;
create or replace function public.request_mp_capture_refresh(p_account text,p_channel text,p_user uuid,p_history boolean,p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r mp_capture_refresh_requests;online boolean;
begin
 if not can_manage_financial_operations(p_user) then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_channel not in ('activity','banking') or p_history is null or p_from<'2026-10-01' or p_to<p_from or p_to-p_from>31 then raise exception 'Período o canal inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended('mp-capture-refresh:'||p_account||':'||p_channel,0));
 if not exists(select 1 from mp_accounts where id=p_account and is_active) then raise exception 'Cuenta no disponible';end if;
 update mp_capture_refresh_requests set status='expired',completed_at=now(),message='El monitor no respondió a tiempo' where account_id=p_account and channel=p_channel and status in ('queued','reading') and created_at<now()-case when history then interval '15 minutes' else interval '120 seconds' end;
 select * into r from mp_capture_refresh_requests where account_id=p_account and channel=p_channel and status in ('queued','reading') order by created_at desc limit 1;
 if found then return to_jsonb(r);end if;
 select * into r from mp_capture_refresh_requests where account_id=p_account and channel=p_channel and history=p_history and date_from=p_from and date_to=p_to and created_at>now()-interval '10 seconds' order by created_at desc limit 1;
 if found then return to_jsonb(r);end if;
 select exists(select 1 from mp_capture_refresh_monitors where account_id=p_account and channel=p_channel and last_seen_at>now()-interval '45 seconds') into online;
 insert into mp_capture_refresh_requests(account_id,channel,requested_by,status,message,history,date_from,date_to)
 values(p_account,p_channel,p_user,case when online then 'queued' else 'offline' end,case when online then 'Esperando al monitor' else 'Monitor desconectado. Abrí '||case when p_channel='activity' then 'Actividad' else 'Movimientos' end||' con la extensión activa.' end,p_history,p_from,p_to) returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.poll_mp_capture_refresh(p_account text,p_channel text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r mp_capture_refresh_requests;
begin
 if p_channel not in ('activity','banking') or not exists(select 1 from mp_accounts where id=p_account and is_active) then raise exception 'Cuenta o canal inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended('mp-capture-refresh:'||p_account||':'||p_channel,0));
 insert into mp_capture_refresh_monitors(account_id,channel) values(p_account,p_channel) on conflict(account_id,channel) do update set last_seen_at=now();
 update mp_capture_refresh_requests set status='expired',completed_at=now(),message='El monitor no respondió a tiempo' where account_id=p_account and channel=p_channel and status in ('queued','reading') and created_at<now()-case when history then interval '15 minutes' else interval '120 seconds' end;
 select * into r from mp_capture_refresh_requests where account_id=p_account and channel=p_channel and status='queued' order by created_at limit 1 for update;
 if not found then return null;end if;
 update mp_capture_refresh_requests set status='reading',claimed_at=now(),message='Leyendo '||p_channel where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
create or replace function public.complete_mp_capture_refresh(p_account text,p_channel text,p_id uuid,p_ok boolean,p_message text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update mp_capture_refresh_requests set status=case when p_ok then 'completed' else 'failed' end,message=left(p_message,300),completed_at=now()
 where account_id=p_account and channel=p_channel and id=p_id and status='reading' and created_at>now()-case when history then interval '15 minutes' else interval '120 seconds' end;
 return found;
end $$;
revoke all on function public.request_mp_capture_refresh(text,text,uuid,boolean,date,date),public.poll_mp_capture_refresh(text,text),public.complete_mp_capture_refresh(text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.request_mp_capture_refresh(text,text,uuid,boolean,date,date),public.poll_mp_capture_refresh(text,text),public.complete_mp_capture_refresh(text,text,uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
