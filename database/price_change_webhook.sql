-- Wake the worker on committed price events. No periodic polling is required.
begin;
alter table public.price_change_sync_settings
 add column if not exists dispatch_url text,
 add column if not exists dispatch_secret_id uuid,
 add column if not exists last_webhook_request_id bigint,
 add column if not exists last_webhook_requested_at timestamptz,
 add column if not exists last_worker_at timestamptz;

create or replace function public.request_price_sync_wake() returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare destination text; secret_value text; request_id bigint;
begin
 select s.dispatch_url,v.decrypted_secret into destination,secret_value
 from public.price_change_sync_settings s join vault.decrypted_secrets v on v.id=s.dispatch_secret_id
 where s.id and s.enabled;
 if destination is null or secret_value is null then return null; end if;
 if destination<>'https://zono-price-sync.diego-boveda.workers.dev/wake' then raise exception 'Destino de precios inválido'; end if;
 select net.http_post(url:=destination,
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret_value),
  body:=jsonb_build_object('kind','price-change'),timeout_milliseconds:=15000) into request_id;
 update public.price_change_sync_settings set last_webhook_request_id=request_id,last_webhook_requested_at=clock_timestamp() where id;
 return request_id;
end $$;
revoke all on function public.request_price_sync_wake() from public,anon,authenticated,service_role;

create or replace function public.wake_price_change_worker() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Coalesce a bulk import into one wakeup, sent by pg_net only after COMMIT.
 if current_setting('price_sync.wake_requested',true)='true' then return new; end if;
 begin
  if public.request_price_sync_wake() is not null then
   perform set_config('price_sync.wake_requested','true',true);
  end if;
 exception when others then
  update public.price_change_events set last_error='No se pudo programar el webhook de precios. El cambio permanece registrado para reenvío.' where id=new.id;
 end;
 return new;
end $$;
revoke all on function public.wake_price_change_worker() from public,anon,authenticated,service_role;
drop trigger if exists price_change_event_wake on public.price_change_events;
create trigger price_change_event_wake after insert on public.price_change_events
 for each row execute function public.wake_price_change_worker();

create or replace function public.next_price_change_wake(p_token text) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.price_change_sync_settings; due_at timestamptz;
begin
 perform public.price_sync_authorize(p_token);
 update public.price_change_sync_settings set last_worker_at=clock_timestamp() where id;
 select * into s from public.price_change_sync_settings where id;
 if not s.enabled then return null; end if;
 select min(e.next_attempt_at) into due_at from public.price_change_events e
 where (e.sheet_state='pending' or e.telegram_state in ('pending','sending'))
 and not exists(select 1 from public.price_change_events earlier where earlier.product_id=e.product_id
  and earlier.event_no<e.event_no and earlier.sheet_state<>'sent');
 if due_at is null then return null; end if;
 due_at:=greatest(due_at,coalesce(s.lease_until,now()));
 return greatest(1,ceil(extract(epoch from (due_at-now())))::integer);
end $$;
revoke all on function public.next_price_change_wake(text) from public;
grant execute on function public.next_price_change_wake(text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
