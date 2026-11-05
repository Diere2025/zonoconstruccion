begin;
set local lock_timeout='3s';
lock table public.route_sales in share row exclusive mode;
alter table public.route_sales add column if not exists notice_day date;
alter table public.route_sales add column if not exists notice_number integer check(notice_number>0);

create table if not exists public.route_sale_counters (
 telegram_chat_id text not null,
 notice_day date not null,
 last_number integer not null check(last_number>0),
 primary key(telegram_chat_id,notice_day)
);
alter table public.route_sale_counters enable row level security;
revoke all on public.route_sale_counters from anon,authenticated;
grant all on public.route_sale_counters to service_role;

-- Bootstrap existing notices by original publication order, not delivery date
-- or the time their reference was imported. Never renumber existing notices.
with unnumbered as (
 select id,telegram_chat_id,(created_at at time zone 'America/Argentina/Buenos_Aires')::date as day,
 telegram_message_id,created_at
 from public.route_sales where telegram_message_id is not null and notice_number is null
), numbered as (
 select u.id,u.day,
 (coalesce((select max(s.notice_number) from public.route_sales s
  where s.telegram_chat_id=u.telegram_chat_id and s.notice_day=u.day),0)
 + row_number() over(partition by u.telegram_chat_id,u.day order by u.telegram_message_id,u.created_at,u.id))::integer as n
 from unnumbered u
)
update public.route_sales s set notice_day=n.day,notice_number=n.n from numbered n where s.id=n.id;

create unique index if not exists route_sale_notice_number_unique
 on public.route_sales(telegram_chat_id,notice_day,notice_number) where notice_number is not null;
insert into public.route_sale_counters(telegram_chat_id,notice_day,last_number)
 select telegram_chat_id,notice_day,max(notice_number) from public.route_sales
 where notice_number is not null group by telegram_chat_id,notice_day
 on conflict(telegram_chat_id,notice_day) do update set last_number=greatest(route_sale_counters.last_number,excluded.last_number);

create or replace function public.assign_route_sale_number(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare sale route_sales; day date; n integer;
begin
 select * into sale from route_sales where id=p_id for update;
 if not found or sale.notice_number is not null or sale.status='review' or sale.delivery_state<>'idle' then return; end if;
 day := (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date;
 insert into route_sale_counters(telegram_chat_id,notice_day,last_number) values(sale.telegram_chat_id,day,1)
 on conflict(telegram_chat_id,notice_day) do update set last_number=route_sale_counters.last_number+1 returning last_number into n;
 update route_sales set notice_day=day,notice_number=n where id=p_id;
end $$;

create or replace function public.claim_route_sale_notice(p_id uuid) returns setof public.route_sales
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update route_sales set delivery_state=case when delivery_state='sending' then 'uncertain' else 'idle' end,
 last_error='Aviso interrumpido: verificar en Telegram' where id=p_id
 and delivery_state in ('sending','editing') and delivery_started_at < now()-interval '10 minutes';
 perform assign_route_sale_number(p_id);
 return query update route_sales set delivery_state=case when telegram_message_id is null then 'sending' else 'editing' end,
 delivery_started_at=now() where id=p_id and delivery_state='idle' and status <> 'review' returning *;
end $$;
revoke all on function public.assign_route_sale_number(uuid),public.claim_route_sale_notice(uuid) from public,anon,authenticated;
grant execute on function public.assign_route_sale_number(uuid),public.claim_route_sale_notice(uuid) to service_role;
notify pgrst,'reload schema';
commit;
