begin;
create extension if not exists pg_net with schema extensions;

create table if not exists public.order_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  seller_id uuid not null,
  submitted_by uuid,
  customer_name text not null,
  code text,
  status text not null default 'awaiting_items' check (status in ('awaiting_items','pending','processing','completed','attention')),
  payload jsonb not null,
  result jsonb,
  message text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
alter table public.order_sync_jobs enable row level security;
revoke all on public.order_sync_jobs from anon, authenticated;
create policy order_sync_jobs_read on public.order_sync_jobs for select to authenticated
  using (seller_id = auth.uid() or submitted_by = auth.uid()
    or exists (select 1 from public.sellers where id=auth.uid() and role='admin'));
grant select (id,order_id,seller_id,submitted_by,customer_name,code,status,message,read_at,created_at,started_at,finished_at) on public.order_sync_jobs to authenticated;
grant all on public.order_sync_jobs to service_role;
create index if not exists order_sync_jobs_pending on public.order_sync_jobs(created_at) where status in ('pending','processing','awaiting_items');

create table if not exists public.order_sync_worker_config (
  id boolean primary key default true check (id),
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  url text not null default 'https://zono-erp.pages.dev/api/vendedores/order-sync-worker'
);
alter table public.order_sync_worker_config enable row level security;
revoke all on public.order_sync_worker_config from anon, authenticated;
grant select on public.order_sync_worker_config to service_role;
insert into public.order_sync_worker_config(id) values(true) on conflict do nothing;

create or replace function public.dispatch_order_sync() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare config public.order_sync_worker_config;
begin
  if not exists (select 1 from public.order_sync_jobs where status in ('pending','processing','awaiting_items')) then return; end if;
  select * into config from public.order_sync_worker_config where id = true;
  perform net.http_post(url := config.url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || config.secret),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
end $$;
revoke all on function public.dispatch_order_sync() from public, anon, authenticated;

-- The outbox is committed in the same transaction as the ERP order.
create or replace function public.capture_order_sync_job() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.totals ? 'integration_payload' then
    insert into public.order_sync_jobs(order_id,seller_id,submitted_by,customer_name,payload)
      values(new.id,new.seller_id,auth.uid(),coalesce(new.customer_name,'Cliente'),new.totals->'integration_payload');
  end if;
  return new;
end $$;
create trigger capture_order_sync_job after insert on public.orders
  for each row execute function public.capture_order_sync_job();

-- All product rows are committed together before the worker can claim the job.
create or replace function public.release_order_sync_job() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.order_sync_jobs set status = 'pending'
    where order_id = new.order_id and status = 'awaiting_items';
  if found then
    begin
      perform public.dispatch_order_sync();
    exception when others then
      -- The minute scheduler will pick up this durable pending job.
      raise warning 'Immediate order sync dispatch failed';
    end;
  end if;
  return new;
end $$;
create trigger release_order_sync_job after insert on public.order_items
  for each row execute function public.release_order_sync_job();

-- Serialize shared spreadsheet allocation across sellers and concurrent requests.
create or replace function public.claim_order_sync_job() returns setof public.order_sync_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(740016);
  update public.order_sync_jobs set status='attention', finished_at=now(),
    message='La sincronización se interrumpió. Revisá las planillas antes de volver a sincronizar para evitar duplicados.'
    where status='processing' and started_at < now() - interval '10 minutes';
  update public.order_sync_jobs set status='attention', finished_at=now(),
    message='El pedido se guardó pero la carga de productos no terminó. Revisá el pedido en el ERP.'
    where status='awaiting_items' and created_at < now() - interval '10 minutes';
  if exists (select 1 from public.order_sync_jobs where status='processing') then return; end if;
  return query update public.order_sync_jobs set status='processing', started_at=now()
    where id=(select id from public.order_sync_jobs where status='pending' order by created_at limit 1 for update skip locked)
    returning *;
end $$;
revoke all on function public.claim_order_sync_job() from public, anon, authenticated;
grant execute on function public.claim_order_sync_job() to service_role;

create or replace function public.mark_order_sync_read(job_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.order_sync_jobs set read_at=now() where id=job_id
    and (seller_id=auth.uid() or submitted_by=auth.uid()
      or exists (select 1 from public.sellers where id=auth.uid() and role='admin'));
$$;
revoke all on function public.mark_order_sync_read(uuid) from public, anon;
grant execute on function public.mark_order_sync_read(uuid) to authenticated;

select cron.schedule('order-sync-worker', '* * * * *', 'select public.dispatch_order_sync()');
notify pgrst, 'reload schema';
commit;
