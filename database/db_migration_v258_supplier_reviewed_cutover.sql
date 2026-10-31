-- Operator-reviewed recent cutover. Old money/stock remains intact; covered entries are excluded once.
begin;
create table public.supplier_cutover_events (
 id uuid primary key default gen_random_uuid(),supplier_id uuid not null references suppliers(id),batch_id uuid not null references supplier_import_batches(id),
 actor_id uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,before_value jsonb not null,after_value jsonb not null,
 created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table supplier_cutover_events enable row level security;
revoke all on supplier_cutover_events from public,anon,authenticated;
grant select,insert on supplier_cutover_events to service_role;
create function public.supplier_cutover_signature(p_supplier uuid,p_batch uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
select md5(coalesce((select to_jsonb(s)::text from supplier_account_starts s where supplier_id=p_supplier),'null')
 ||coalesce((select jsonb_agg(to_jsonb(e) order by source,source_id)::text from supplier_account_entries e where supplier_id=p_supplier),'[]')
 ||coalesce((select jsonb_agg(to_jsonb(h) order by source,source_id)::text from supplier_account_history h where supplier_id=p_supplier),'[]')
 ||coalesce((select jsonb_agg(to_jsonb(r) order by id)::text from supplier_import_rows r where supplier_id=p_supplier and batch_id=p_batch),'[]')
 ||coalesce((select jsonb_agg(to_jsonb(a) order by a.id)::text from supplier_source_aliases a join supplier_import_batches b on b.source_book=a.source_book where b.id=p_batch),'[]')
 ||coalesce((select jsonb_agg(to_jsonb(l) order by l.id)::text from supplier_source_links l join supplier_import_rows r on r.id=l.import_row_id where r.batch_id=p_batch and r.supplier_id=p_supplier),'[]'))
$$;
create function public.get_supplier_cutover_review(p_supplier uuid,p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare b supplier_import_batches;rows integer;pending integer;invalid integer;aliases integer;dates integer;links integer;detail integer;apps integer;credits integer;ars numeric;usd numeric;
begin
 select * into strict b from supplier_import_batches where id=p_batch;
 select count(*),count(*) filter(where status not in ('linked','to_import','excluded')),
 count(*) filter(where status<>'excluded' and (currency is null or amount is null or reviewed_by is null or length(trim(coalesce(decision_reason,'')))<3)),
 count(*) filter(where status<>'excluded' and (effective_date is null or effective_date>b.cutoff_date)),
 coalesce(sum(amount) filter(where status in ('linked','to_import') and currency='ARS'),0),coalesce(sum(amount) filter(where status in ('linked','to_import') and currency='USD'),0)
 into rows,pending,invalid,dates,ars,usd from supplier_import_rows where supplier_id=p_supplier and batch_id=p_batch;
 select count(*) into aliases from supplier_import_rows r where r.supplier_id=p_supplier and r.batch_id=p_batch and r.status<>'excluded'
 and not exists(select 1 from supplier_source_aliases a where a.source_book=b.source_book and a.source_alias=r.original_values->>2 and a.supplier_id=p_supplier and a.status='verified');
 select count(*) into links from supplier_import_rows r where r.batch_id=p_batch and r.supplier_id=p_supplier and r.status='linked'
 and not exists(select 1 from supplier_source_links l join supplier_account_entries e on (e.source='purchase' and e.source_id=l.purchase_id) or (e.source='payment' and e.source_id=l.payment_id)
 where l.import_row_id=r.id and not e.voided and e.supplier_id=r.supplier_id and e.currency=r.currency and abs(e.amount)>=abs(r.amount) and l.covered_amount=abs(r.amount));
 -- Reusing one ERP origin for several source rows requires exact aggregate coverage.
 links:=links+(select count(*) from (select coalesce(l.purchase_id,l.payment_id) id,sum(l.covered_amount) covered,max(abs(e.amount)) available
 from supplier_source_links l join supplier_import_rows r on r.id=l.import_row_id join supplier_account_entries e on (e.source='purchase' and e.source_id=l.purchase_id) or (e.source='payment' and e.source_id=l.payment_id)
 where r.batch_id=p_batch and r.supplier_id=p_supplier and r.status='linked' group by coalesce(l.purchase_id,l.payment_id) having sum(l.covered_amount)>max(abs(e.amount)))a);
 select count(*) into detail from supplier_opening_items where supplier_id=p_supplier;
 select count(*) into apps from supplier_opening_applications where supplier_id=p_supplier;
 select count(*) into credits from supplier_credit_allocations a join supplier_purchases p on p.id=a.credit_id where p.supplier_id=p_supplier;
 return jsonb_build_object('supplierId',p_supplier,'batchId',p_batch,'cutoffDate',b.cutoff_date,'snapshotHash',b.snapshot_hash,'signature',supplier_cutover_signature(p_supplier,p_batch),
 'rows',rows,'pending',pending,'invalid',invalid,'unverifiedAliases',aliases,'invalidDates',dates,'invalidLinks',links,'openingDetail',detail,'openingApplications',apps,'documentCredits',credits,'openingArs',ars,'openingUsd',usd,
 'ready',rows>0 and pending=0 and invalid=0 and aliases=0 and dates=0 and links=0 and detail=0 and apps=0 and credits=0 and b.cutoff_date<=(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date);
end $$;
create function public.apply_supplier_reviewed_cutover(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare supplier uuid:=(p_payload->>'supplierId')::uuid;batch uuid:=(p_payload->>'batchId')::uuid;prior supplier_cutover_events;report jsonb;before_value jsonb;result jsonb;day date;event uuid:=gen_random_uuid();
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para aprobar el punto de partida.' using errcode='42501';end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 10 and 2000 or coalesce((p_payload->>'approved')::boolean,false) is not true then raise exception 'Revisá y aprobá el lote con su criterio de corte.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-cutover:'||p_request::text,0));
 select * into prior from supplier_cutover_events where actor_id=p_actor and request_id=p_request;
 if found then if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505';end if;return prior.after_value;end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 perform 1 from supplier_import_batches where id=batch for update;perform 1 from supplier_import_rows where supplier_id=supplier and batch_id=batch order by id for update;
 perform 1 from supplier_source_aliases a where a.source_book=(select source_book from supplier_import_batches where id=batch) order by a.id for update;
 perform 1 from suppliers where id=supplier for update;
 report:=get_supplier_cutover_review(supplier,batch);
 if report->>'signature' is distinct from p_payload->>'signature' then raise exception 'El lote o el ERP cambiaron. Volvé a preparar la revisión.' using errcode='40001';end if;
 if (report->>'ready')::boolean is not true then raise exception 'Quedan filas, equivalencias o aplicaciones sin resolver. El lote no puede aplicarse.';end if;
 if (p_payload->>'openingArs')::numeric is distinct from (report->>'openingArs')::numeric or (p_payload->>'openingUsd')::numeric is distinct from (report->>'openingUsd')::numeric then raise exception 'Los saldos aprobados no coinciden con las filas revisadas.';end if;
 day:=(report->>'cutoffDate')::date;
 before_value:=jsonb_build_object('start',(select to_jsonb(s) from supplier_account_starts s where supplier_id=supplier),'history',coalesce((select jsonb_agg(to_jsonb(h) order by source,source_id) from supplier_account_history h where supplier_id=supplier),'[]'),
 'review',report,'rows',(select jsonb_agg(to_jsonb(r) order by r.id) from supplier_import_rows r where supplier_id=supplier and batch_id=batch));
 -- Every existing document/payment through the cut is covered by the reviewed opening.
 insert into supplier_account_history(supplier_id,source,source_id,included,notes,updated_by,updated_at)
 select supplier,e.source,e.source_id,false,'Cubierto por apertura revisada · lote '||batch,p_actor,clock_timestamp() from supplier_account_entries e where e.supplier_id=supplier and e.entry_date<=day
 on conflict(supplier_id,source,source_id) do update set included=false,notes=excluded.notes,updated_by=p_actor,updated_at=clock_timestamp();
 insert into supplier_account_starts(supplier_id,start_date,opening_ars,opening_usd,notes,updated_by,updated_at)
 values(supplier,day,(report->>'openingArs')::numeric,(report->>'openingUsd')::numeric,trim(p_payload->>'reason')||' · lote '||batch,p_actor,clock_timestamp())
 on conflict(supplier_id) do update set start_date=excluded.start_date,opening_ars=excluded.opening_ars,opening_usd=excluded.opening_usd,notes=excluded.notes,updated_by=p_actor,updated_at=clock_timestamp();
 result:=jsonb_build_object('eventId',event,'supplierId',supplier,'batchId',batch,'startDate',day,'openingArs',report->'openingArs','openingUsd',report->'openingUsd','signature',supplier_cutover_signature(supplier,batch));
 insert into supplier_cutover_events(id,supplier_id,batch_id,actor_id,request_id,payload,before_value,after_value) values(event,supplier,batch,p_actor,p_request,p_payload,before_value,result);return result;
end $$;
create function public.reverse_supplier_reviewed_cutover(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare original supplier_cutover_events;prior supplier_cutover_events;start_value jsonb;h jsonb;result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para revertir la apertura.' using errcode='42501';end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 10 and 2000 then raise exception 'Anotá el motivo de reversión.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-cutover:'||p_request::text,0));
 select * into prior from supplier_cutover_events where actor_id=p_actor and request_id=p_request;
 if found then if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505';end if;return prior.after_value;end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict original from supplier_cutover_events where id=(p_payload->>'eventId')::uuid for update;
 if original.after_value->>'eventId' is null or supplier_cutover_signature(original.supplier_id,original.batch_id) is distinct from original.after_value->>'signature' then raise exception 'El estado cambió después del corte. Revisá los movimientos antes de revertir.' using errcode='40001';end if;
 if exists(select 1 from supplier_opening_applications where supplier_id=original.supplier_id) or exists(select 1 from supplier_opening_items where supplier_id=original.supplier_id) then raise exception 'Liberá aplicaciones y detalle de apertura antes de revertir el corte.';end if;
 start_value:=original.before_value->'start';
 delete from supplier_account_history where supplier_id=original.supplier_id;
 for h in select x from jsonb_array_elements(original.before_value->'history') x loop
  insert into supplier_account_history(supplier_id,source,source_id,included,notes,updated_by,updated_at)
  values(original.supplier_id,h->>'source',(h->>'source_id')::uuid,(h->>'included')::boolean,coalesce(h->>'notes','')||' · Restaurado por reversión de corte',p_actor,clock_timestamp());
 end loop;
 if start_value is null or start_value='null'::jsonb then delete from supplier_account_starts where supplier_id=original.supplier_id;
 else update supplier_account_starts set start_date=(start_value->>'start_date')::date,opening_ars=(start_value->>'opening_ars')::numeric,opening_usd=(start_value->>'opening_usd')::numeric,notes=start_value->>'notes',updated_by=p_actor,updated_at=clock_timestamp() where supplier_id=original.supplier_id;end if;
 result:=jsonb_build_object('reverses',original.id,'supplierId',original.supplier_id,'signature',supplier_cutover_signature(original.supplier_id,original.batch_id));
 insert into supplier_cutover_events(supplier_id,batch_id,actor_id,request_id,payload,before_value,after_value) values(original.supplier_id,original.batch_id,p_actor,p_request,p_payload,original.after_value,result);return result;
end $$;
revoke all on function supplier_cutover_signature(uuid,uuid),get_supplier_cutover_review(uuid,uuid),apply_supplier_reviewed_cutover(uuid,uuid,jsonb),reverse_supplier_reviewed_cutover(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function supplier_cutover_signature(uuid,uuid),get_supplier_cutover_review(uuid,uuid),apply_supplier_reviewed_cutover(uuid,uuid,jsonb),reverse_supplier_reviewed_cutover(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
