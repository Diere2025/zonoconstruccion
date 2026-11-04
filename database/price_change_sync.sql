-- Each committed ERP price update becomes a durable, ordered event.
begin;
create table if not exists public.price_change_sync_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 chat_id text check(chat_id ~ '^-[0-9]+$'),
 control_hash text not null default '',
 lease_token uuid,
 lease_until timestamptz,
 check(not enabled or (chat_id is not null and control_hash <> ''))
);
insert into public.price_change_sync_settings(id) values(true) on conflict do nothing;
create table if not exists public.price_change_events (
 id uuid primary key default gen_random_uuid(),
 event_no bigint generated always as identity unique,
 product_id uuid not null,
 product_name text not null,
 sheet_product text not null,
 old_price numeric,
 new_price numeric not null,
 changed_at timestamptz not null default clock_timestamp(),
 effective_date date not null default (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date,
 chat_id text,
 sheet_state text not null default 'pending' check(sheet_state in ('pending','sent')),
 telegram_state text not null default 'pending' check(telegram_state in ('pending','sending','sent','unknown')),
 telegram_message_id bigint,
 sheet_sent_at timestamptz,
 telegram_sent_at timestamptz,
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 claim_token uuid,
 last_error text not null default ''
);
create index if not exists price_change_events_pending on public.price_change_events(event_no)
 where sheet_state='pending' or telegram_state in ('pending','sending');
alter table public.price_change_events enable row level security;
alter table public.price_change_sync_settings enable row level security;
revoke all on public.price_change_events,public.price_change_sync_settings from public,anon,authenticated;
grant select,insert,update,delete on public.price_change_events,public.price_change_sync_settings to service_role;
grant usage,select on sequence public.price_change_events_event_no_seq to service_role;

create or replace function public.enqueue_price_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.price is distinct from old.price then
  insert into public.price_change_events(product_id,product_name,sheet_product,old_price,new_price)
  values(new.id,new.name,coalesce(nullif(btrim(new.sku),''),new.name),old.price,new.price);
 end if;
 return new;
end $$;
revoke all on function public.enqueue_price_change() from public,anon,authenticated,service_role;
drop trigger if exists products_price_change_sync on public.products;
create trigger products_price_change_sync after update of price on public.products
 for each row execute function public.enqueue_price_change();

create or replace function public.price_sync_authorize(p_token text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.price_change_sync_settings where id and control_hash<>'' and control_hash=md5(p_token)) then
  raise exception 'No autorizado' using errcode='42501';
 end if;
end $$;
revoke all on function public.price_sync_authorize(text) from public,anon,authenticated,service_role;

create or replace function public.claim_price_change(p_token text) returns setof public.price_change_events
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.price_change_sync_settings; lease uuid; target uuid;
begin
 perform public.price_sync_authorize(p_token);
 select * into s from public.price_change_sync_settings where id for update skip locked;
 if not found or not s.enabled or s.lease_until>now() then return; end if;
 -- A lost sendMessage response cannot safely be retried automatically.
 update public.price_change_events set telegram_state='unknown',last_error='Telegram no confirmó el envío; revisar el grupo antes de reenviar.'
 where telegram_state='sending' and claim_token=s.lease_token;
 select e.id into target from public.price_change_events e
 where (e.sheet_state='pending' or e.telegram_state='pending') and e.next_attempt_at<=now()
 and not exists(select 1 from public.price_change_events earlier where earlier.product_id=e.product_id
  and earlier.event_no<e.event_no and earlier.sheet_state<>'sent')
 order by e.event_no limit 1 for update skip locked;
 if target is null then return; end if;
 lease:=gen_random_uuid();
 update public.price_change_sync_settings set lease_token=lease,lease_until=now()+interval '3 minutes' where id;
 return query update public.price_change_events set claim_token=lease,attempts=attempts+1,chat_id=coalesce(chat_id,s.chat_id)
 where id=target returning *;
end $$;

create or replace function public.update_price_change(p_token text,p_id uuid,p_claim uuid,p_patch jsonb,p_release boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.price_sync_authorize(p_token);
 if not exists(select 1 from public.price_change_sync_settings where id and lease_token=p_claim and lease_until>now()) then
  raise exception 'La ejecución perdió su reserva';
 end if;
 if p_patch ? 'sheet_state' and p_patch->>'sheet_state'<>'sent' then raise exception 'Estado de planilla inválido'; end if;
 if p_patch ? 'telegram_state' and p_patch->>'telegram_state' not in ('pending','sending','sent','unknown') then raise exception 'Estado Telegram inválido'; end if;
 update public.price_change_events set
 sheet_state=coalesce(p_patch->>'sheet_state',sheet_state),
 telegram_state=coalesce(p_patch->>'telegram_state',telegram_state),
 telegram_message_id=coalesce((p_patch->>'telegram_message_id')::bigint,telegram_message_id),
 sheet_sent_at=case when p_patch->>'sheet_state'='sent' then coalesce(sheet_sent_at,now()) else sheet_sent_at end,
 telegram_sent_at=case when p_patch->>'telegram_state'='sent' then coalesce(telegram_sent_at,now()) else telegram_sent_at end,
 last_error=coalesce(left(p_patch->>'last_error',1000),last_error),
 next_attempt_at=case when p_patch ? 'retry_seconds' then now()+make_interval(secs=>greatest(30,least(86400,(p_patch->>'retry_seconds')::integer))) else next_attempt_at end
 where id=p_id and claim_token=p_claim;
 if not found then raise exception 'Cambio de precio no reservado'; end if;
 if p_release then update public.price_change_sync_settings set lease_until=null where id and lease_token=p_claim; end if;
end $$;
revoke all on function public.claim_price_change(text),public.update_price_change(text,uuid,uuid,jsonb,boolean) from public;
grant execute on function public.claim_price_change(text),public.update_price_change(text,uuid,uuid,jsonb,boolean) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
