begin;

create or replace function public.capture_order_cancellation_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'Cancelado' then
    v_kind := 'cancel';
  elsif old.status in ('Cancelado', 'Anulado') and new.status not in ('Cancelado', 'Anulado') then
    -- An imported reactivation already happened in Sheets; avoid writing it back.
    if auth.uid() is null then return new; end if;
    v_kind := 'reactivate';
  else
    return new;
  end if;

  insert into public.order_sync_jobs(order_id,seller_id,submitted_by,customer_name,code,kind,status,payload)
  values(new.id,coalesce(new.seller_id,'00000000-0000-0000-0000-000000000000'::uuid),
    auth.uid(),coalesce(new.customer_name,'Cliente'),new.legacy_code,v_kind,'pending',
    case when v_kind = 'cancel'
      then jsonb_build_object('reason',coalesce(nullif(new.cancel_reason,''),'Sin motivo informado'),
        'source',case when auth.uid() is null then 'sheet_sync' else 'erp' end)
      else '{}'::jsonb end)
  on conflict(order_id,kind) do update set status='pending', payload=excluded.payload,
    submitted_by=excluded.submitted_by, code=excluded.code,
    read_at=null, started_at=null, finished_at=null, message=null, result=null;
  begin
    perform public.dispatch_order_sync();
  exception when others then
    raise warning 'Immediate order status dispatch failed; scheduled worker will resume';
  end;
  return new;
end $$;

commit;
