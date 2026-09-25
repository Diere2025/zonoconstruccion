begin;
alter table public.orders add column if not exists cancel_reason text;
alter table public.order_sync_jobs add column kind text not null default 'create'
  check (kind in ('create','cancel'));
alter table public.order_sync_jobs drop constraint order_sync_jobs_order_id_key;
alter table public.order_sync_jobs add constraint order_sync_jobs_order_kind_key unique(order_id,kind);
grant select(kind) on public.order_sync_jobs to authenticated;

create or replace function public.capture_order_cancellation_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='Cancelado' and old.status is distinct from new.status then
    insert into public.order_sync_jobs(order_id,seller_id,submitted_by,customer_name,code,kind,status,payload)
    values(new.id,coalesce(new.seller_id,'00000000-0000-0000-0000-000000000000'::uuid),auth.uid(),new.customer_name,new.legacy_code,'cancel','pending',
      jsonb_build_object('reason',coalesce(nullif(new.cancel_reason,''),'Anulado desde ERP')))
    on conflict(order_id,kind) do update set status='pending',payload=excluded.payload,
      read_at=null,started_at=null,finished_at=null,message=null;
    begin
      perform public.dispatch_order_sync();
    exception when others then
      raise warning 'Immediate cancellation dispatch failed; scheduled worker will resume';
    end;
  end if;
  return new;
end $$;
create trigger capture_order_cancellation_job after update of status on public.orders
  for each row execute function public.capture_order_cancellation_job();

-- Old deployed workers only understand creation; keep cancellation queued until v2 is live.
drop function public.claim_order_sync_job();
create function public.claim_order_sync_job(worker_version integer default 1) returns setof public.order_sync_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(740016);
  update public.order_sync_jobs set status='attention', finished_at=now(),
    message='La sincronización se interrumpió. Revisá las planillas antes de volver a sincronizar para evitar duplicados.'
    where status='processing' and started_at < now()-interval '10 minutes';
  update public.order_sync_jobs set status='attention', finished_at=now(),
    message='El pedido se guardó pero la carga de productos no terminó. Revisá el pedido en el ERP.'
    where status='awaiting_items' and created_at < now()-interval '10 minutes';
  if exists(select 1 from public.order_sync_jobs where status='processing') then return; end if;
  return query update public.order_sync_jobs set status='processing',started_at=now()
    where id=(select id from public.order_sync_jobs where status='pending'
      and (kind='create' or worker_version>=2) order by created_at,id limit 1 for update skip locked)
    returning *;
end $$;
revoke all on function public.claim_order_sync_job(integer) from public,anon,authenticated;
grant execute on function public.claim_order_sync_job(integer) to service_role;
notify pgrst,'reload schema';
commit;
