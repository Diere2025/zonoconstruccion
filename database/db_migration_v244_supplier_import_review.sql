begin;
alter table public.supplier_import_rows add column version integer not null default 1;
create table public.supplier_import_events (
 id uuid primary key default gen_random_uuid(), row_id uuid not null references public.supplier_import_rows(id),
 actor_id uuid not null references auth.users(id), request_id uuid not null,
 before_value jsonb not null, after_value jsonb not null, payload jsonb not null,
 created_at timestamptz not null default now(), unique(actor_id,request_id)
);
alter table public.supplier_import_events enable row level security;
revoke all on public.supplier_import_events from public,anon,authenticated;
grant select,insert on public.supplier_import_events to service_role;

create function public.stage_supplier_import(p_actor uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare batch uuid; item jsonb; prior public.supplier_import_rows; inserted_count integer;
begin
 if not public.can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para revisar proveedores.' using errcode='42501'; end if;
 if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 2000
  or coalesce(p_payload->>'snapshotHash','') !~ '^[a-f0-9]{64}$' or length(coalesce(p_payload->>'sourceBook','')) not between 10 and 120
  then raise exception 'Captura inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-import:'||(p_payload->>'sourceBook'),0));
 insert into public.supplier_import_batches(source_book,snapshot_hash,cutoff_date,captured_at,created_by)
 values(p_payload->>'sourceBook',p_payload->>'snapshotHash',(p_payload->>'cutoffDate')::date,(p_payload->>'capturedAt')::timestamptz,p_actor)
 on conflict(source_book,snapshot_hash) do nothing returning id into batch;
 if batch is null then
  select id into strict batch from public.supplier_import_batches where source_book=p_payload->>'sourceBook' and snapshot_hash=p_payload->>'snapshotHash';
  if exists(select 1 from public.supplier_import_batches where id=batch and (cutoff_date is distinct from (p_payload->>'cutoffDate')::date or captured_at is distinct from (p_payload->>'capturedAt')::timestamptz)) then raise exception 'La captura ya existe con otros metadatos.'; end if;
 end if;
 for item in select value from jsonb_array_elements(p_payload->'rows') loop
  if coalesce(item->>'contentHash','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(item->'originalValues') is distinct from 'array'
   or item->>'component' not in ('opening','payment','purchase','credit','debit','adjustment','unknown') then raise exception 'Contenido de fila inválido.'; end if;
  select * into prior from public.supplier_import_rows where batch_id=batch and sheet_id=item->>'sheetId' and source_row=(item->>'sourceRow')::integer and component=item->>'component';
  if found then
   if prior.content_hash<>item->>'contentHash' or prior.original_values<>item->'originalValues' then raise exception 'La captura contiene cambios de contenido.'; end if;
  else
   insert into public.supplier_import_rows(batch_id,sheet_id,source_row,component,content_hash,original_values,supplier_id,amount,effective_date,status)
   values(batch,item->>'sheetId',(item->>'sourceRow')::integer,item->>'component',item->>'contentHash',item->'originalValues',
    nullif(item->>'supplierId','')::uuid,(item->>'amount')::numeric,(item->>'effectiveDate')::date,
    case when item->>'status'='invalid' then 'invalid' else 'pending_evidence' end);
  end if;
 end loop;
 select count(*) into inserted_count from public.supplier_import_rows where batch_id=batch;
 if inserted_count<>jsonb_array_length(p_payload->'rows') then raise exception 'La captura está incompleta o tiene identidades repetidas.'; end if;
 return batch;
end $$;

create function public.review_supplier_import(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.supplier_import_rows; previous jsonb; result jsonb; prior public.supplier_import_events;
 target_supplier uuid; target_currency text; target_amount numeric; target_void boolean;
begin
 if not public.can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para revisar proveedores.' using errcode='42501'; end if;
 if p_request is null then raise exception 'Falta identidad de solicitud.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,0));
 select * into prior from public.supplier_import_events where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505'; end if;
  return prior.after_value;
 end if;
 select * into strict item from public.supplier_import_rows where id=(p_payload->>'rowId')::uuid for update;
 perform 1 from public.supplier_import_batches where id=item.batch_id and status in ('preview','reviewed') for update;
 if not found then raise exception 'El lote ya fue aplicado o revertido.'; end if;
 if item.version is distinct from (p_payload->>'version')::integer then raise exception 'Otra sesión modificó la fila. Actualizá la revisión.' using errcode='40001'; end if;
 if length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000 or coalesce(p_payload->>'status','') not in ('pending_evidence','excluded','to_import','linked') then raise exception 'Decisión inválida.'; end if;
 if p_payload->>'status' in ('to_import','linked') and (nullif(p_payload->>'supplierId','') is null or coalesce(p_payload->>'currency','') not in ('ARS','USD') or nullif(p_payload->>'effectiveDate','') is null or p_payload->>'amount' is null) then raise exception 'Completá proveedor, moneda, fecha e importe.'; end if;
 previous:=to_jsonb(item)||jsonb_build_object('links',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from public.supplier_source_links l where import_row_id=item.id));
 if p_payload->>'status'='linked' then
  if item.component='payment' and nullif(p_payload->>'paymentId','') is null then raise exception 'Un pago debe cotejarse con un pago existente.'; end if;
  if item.component in ('purchase','credit','debit') and nullif(p_payload->>'purchaseId','') is null then raise exception 'Un documento debe cotejarse con un documento existente.'; end if;
  if item.component not in ('payment','purchase','credit','debit') then raise exception 'Revisá la naturaleza del movimiento antes de vincularlo.'; end if;
  if num_nonnulls(nullif(p_payload->>'purchaseId',''),nullif(p_payload->>'paymentId',''))<>1 then raise exception 'Elegí un solo origen ERP.'; end if;
  if nullif(p_payload->>'purchaseId','') is not null then
   select supplier_id,currency,abs(total_amount),status='Anulado' into strict target_supplier,target_currency,target_amount,target_void
    from public.supplier_purchases where id=(p_payload->>'purchaseId')::uuid for share;
  else
   select supplier_id,currency,abs(amount),reversed_at is not null into strict target_supplier,target_currency,target_amount,target_void
    from public.supplier_payments where id=(p_payload->>'paymentId')::uuid for share;
  end if;
  if target_void or target_supplier is distinct from (p_payload->>'supplierId')::uuid or target_currency is distinct from p_payload->>'currency'
   or target_amount<abs((p_payload->>'amount')::numeric) then raise exception 'El origen no coincide con proveedor, moneda, vigencia o importe.'; end if;
 end if;
 delete from public.supplier_source_links where import_row_id=item.id;
 update public.supplier_import_rows set supplier_id=nullif(p_payload->>'supplierId','')::uuid,currency=nullif(p_payload->>'currency',''),
  amount=(p_payload->>'amount')::numeric,effective_date=(p_payload->>'effectiveDate')::date,status=p_payload->>'status',
  decision_reason=p_payload->>'reason',reviewed_by=p_actor,reviewed_at=clock_timestamp(),version=version+1 where id=item.id returning to_jsonb(supplier_import_rows.*) into result;
 if p_payload->>'status'='linked' then
  insert into public.supplier_source_links(import_row_id,purchase_id,payment_id,covered_amount,relation,created_by)
  values(item.id,nullif(p_payload->>'purchaseId','')::uuid,nullif(p_payload->>'paymentId','')::uuid,abs((p_payload->>'amount')::numeric),'same_event',p_actor);
 end if;
 result:=result||jsonb_build_object('links',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from public.supplier_source_links l where import_row_id=item.id));
 insert into public.supplier_import_events(row_id,actor_id,request_id,before_value,after_value,payload) values(item.id,p_actor,p_request,previous,result,p_payload);
 return result;
end $$;
revoke all on function public.stage_supplier_import(uuid,jsonb),public.review_supplier_import(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.stage_supplier_import(uuid,jsonb),public.review_supplier_import(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
