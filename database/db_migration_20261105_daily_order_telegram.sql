begin;

create table public.daily_order_telegram_messages (
  chat_id text not null,
  order_date date not null,
  message_id bigint check (message_id > 0),
  primary key (chat_id, order_date)
);

alter table public.daily_order_telegram_messages enable row level security;
revoke all on public.daily_order_telegram_messages from public, anon, authenticated;
grant select, insert, update, delete on public.daily_order_telegram_messages to service_role;

notify pgrst, 'reload schema';
commit;
