begin;

create table if not exists public.support_telegram_settings(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 chat_id text not null default '' check(chat_id='' or chat_id ~ '^-?[0-9]+$'),
 updated_at timestamptz not null default now(),
 check(not enabled or chat_id<>'')
);
insert into public.support_telegram_settings(id) values(true) on conflict do nothing;

-- Discovery is separate from activation: a group name never grants access to alerts.
create table if not exists public.support_telegram_candidates(
 chat_id text primary key check(chat_id ~ '^-[0-9]+$'),
 title text not null,
 observed_at timestamptz not null default now()
);

create table if not exists public.support_telegram_jobs(
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null unique references public.support_tickets(id) on delete cascade,
 ticket_number bigint not null,
 title text not null,
 creator_name text not null,
 priority text not null check(priority in ('low','medium','high','critical')),
 chat_id text not null check(chat_id ~ '^-?[0-9]+$'),
 state text not null default 'pending' check(state in ('pending','sending','sent','error','unknown')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz,
 claim_token uuid,
 sent_at timestamptz,
 telegram_message_id bigint,
 last_error text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists support_telegram_jobs_pending on public.support_telegram_jobs(next_attempt_at,created_at) where state in ('pending','error');
alter table public.support_telegram_settings enable row level security;
alter table public.support_telegram_jobs enable row level security;
alter table public.support_telegram_candidates enable row level security;
revoke all on public.support_telegram_settings,public.support_telegram_jobs,public.support_telegram_candidates from public,anon,authenticated;
grant select,insert,update,delete on public.support_telegram_settings,public.support_telegram_jobs,public.support_telegram_candidates to service_role;

create or replace function public.support_enqueue_telegram() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare destination text; creator text;
begin
 if new.workflow<>'incident' then return new; end if;
 select chat_id into destination from public.support_telegram_settings where id and enabled;
 if destination is null then return new; end if;
 select s.full_name into creator from public.support_profiles p join public.sellers s on s.id=p.seller_id where p.user_id=new.created_by;
 insert into public.support_telegram_jobs(ticket_id,ticket_number,title,creator_name,priority,chat_id)
 values(new.id,new.number,new.title,coalesce(nullif(trim(creator),''),'Usuario del ERP'),new.priority,destination)
 on conflict(ticket_id) do nothing;
 return new;
end $$;
revoke all on function public.support_enqueue_telegram() from public,anon,authenticated,service_role;
drop trigger if exists support_ticket_telegram_created on public.support_tickets;
create trigger support_ticket_telegram_created after insert on public.support_tickets for each row execute function public.support_enqueue_telegram();

create or replace function public.support_claim_telegram_jobs(p_ticket uuid default null,p_limit integer default 3)
returns setof public.support_telegram_jobs language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Telegram has no sendMessage idempotency key. A lost response must be reviewed,
 -- rather than automatically delivering the same notification a second time.
 update public.support_telegram_jobs set state='unknown',last_error='El envío quedó sin confirmación; revisar Telegram antes de reenviar.'
 where state='sending' and claimed_at<now()-interval '2 minutes';
 if not exists(select 1 from public.support_telegram_settings where id and enabled) then return; end if;
 return query with candidates as (
  select j.id from public.support_telegram_jobs j
  where j.state in ('pending','error') and j.attempts<5 and j.next_attempt_at<=now()
   and (p_ticket is null or j.ticket_id=p_ticket)
  order by j.created_at,j.id limit greatest(1,least(coalesce(p_limit,3),10)) for update skip locked
 ) update public.support_telegram_jobs j set state='sending',attempts=j.attempts+1,claimed_at=now(),claim_token=gen_random_uuid()
 from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.support_claim_telegram_jobs(uuid,integer) from public,anon,authenticated;
grant execute on function public.support_claim_telegram_jobs(uuid,integer) to service_role;

notify pgrst,'reload schema';
commit;
