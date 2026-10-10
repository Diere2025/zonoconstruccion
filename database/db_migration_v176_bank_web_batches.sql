begin;
alter table public.mp_bank_web_rows add column if not exists prepared_entry_id uuid references public.bank_statement_entries(id);
do $$ declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.bank_statement_entries'::regclass and contype='c' and pg_get_constraintdef(oid) like '%external_movement_id%' loop execute format('alter table public.bank_statement_entries drop constraint %I',c.conname);end loop;
end $$;
alter table public.bank_statement_entries add constraint bank_entry_external_identity check(external_movement_id ~ '^[0-9]{1,80}$' or external_movement_id ~ '^web:[0-9a-f-]{36}$');
create or replace function public.create_bank_statement_from_web(p_actor uuid,p_account uuid,p_ids jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a financial_accounts;mp text;r mp_bank_web_rows;e bank_statement_entries;b bank_import_batches;bid uuid;eid uuid;key text;row_source jsonb;stamp text;description text;pos integer:=0;incoming numeric:=0;outgoing numeric:=0;v_totals jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 if jsonb_typeof(p_ids) is distinct from 'array' or jsonb_array_length(p_ids) not between 1 and 1000 then raise exception 'Seleccioná entre 1 y 1000 capturas.';end if;
 if (select count(distinct value) from jsonb_array_elements_text(p_ids))<>jsonb_array_length(p_ids) then raise exception 'Selección duplicada';end if;
 select * into strict a from financial_accounts where id=p_account for update;
 if not a.is_active or a.currency<>'ARS' or a.type not in ('banco','virtual') or a.name !~* '^Cuenta[. ]MP([0-9]+|Caro)$' then raise exception 'Cuenta no disponible';end if;
 select mp_account_id into strict mp from bank_statement_mp_accounts where financial_account_id=p_account;
 if (select count(*) from mp_bank_web_rows where mp_account_id=mp and id::text in(select value from jsonb_array_elements_text(p_ids)) and occurred_at>='2026-10-01T00:00:00-03:00'::timestamptz)<>jsonb_array_length(p_ids) then raise exception 'Capturas inválidas para esta cuenta';end if;
 if exists(select 1 from mp_bank_web_rows w where w.id::text in(select value from jsonb_array_elements_text(p_ids)) and (select count(*) from mp_bank_web_rows x where x.mp_account_id=mp and x.operation_id=w.operation_id and x.amount=w.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',w.occurred_at))<>1) then raise exception 'Hay componentes ambiguos. Excluí esas filas y completalas con el extracto mensual.';end if;
 select string_agg(id::text,',' order by id) into key from mp_bank_web_rows where id::text in(select value from jsonb_array_elements_text(p_ids));
 key:=md5(mp||':'||key)||md5('web:'||mp||':'||key);
 select * into b from bank_import_batches where financial_account_id=p_account and file_hash=key;
 if found then
  if b.deleted_at is not null then update bank_import_batches set deleted_at=null,deleted_by=null,version=version+1 where id=b.id;end if;
  return b.id;
 end if;
 insert into bank_import_batches(financial_account_id,filename,file_hash,storage_path,parser_version,date_policy,totals,created_by)
 values(p_account,'Captura web · '||a.name||' · provisional',key,'web:'||key,'mp-web-v1','source-calendar-v1','{}',p_actor) returning id into bid;
 for r in select * from mp_bank_web_rows where id::text in(select value from jsonb_array_elements_text(p_ids)) order by occurred_at,id for update loop
  pos:=pos+1;stamp:=to_char(r.occurred_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD"T"HH24:MI:SS"Z"');
  description:=case when r.operation_kind='reserve_transfer' then 'Movimiento de cuentas' when lower(trim(r.description))='movimiento desconocido' and lower(trim(coalesce(r.activity_type,'')))='transferencia recibida' then 'Dinero recibido' else r.description end;
  row_source:=jsonb_build_object('sheet','Captura web','row',pos,'errors','[]'::jsonb,'movementId','web:'||r.id::text,'operationId',r.operation_id,'sourceDate',stamp,'occurredAt',stamp,'date',left(stamp,10),'description',description,'amount',to_char(r.amount,'FM999999999999990.00'),'cents',r.amount*100,'raw',jsonb_build_array(stamp,r.description,r.operation_id,r.amount),'origin','web','webCaptureId',r.id,'originalOccurredAt',r.occurred_at,'counterpartyName',r.counterparty_name,'activityType',r.activity_type,'operationKind',r.operation_kind);
  eid:=coalesce(r.statement_entry_id,r.prepared_entry_id);
  if eid is null then
   insert into bank_statement_entries(financial_account_id,external_movement_id,related_operation_id,source_date,occurred_at,effective_date,description,signed_amount,source)
   values(p_account,'web:'||r.id::text,r.operation_id,stamp,stamp::timestamptz,left(stamp,10)::date,description,r.amount,row_source) returning id into eid;
  else
   select * into strict e from bank_statement_entries where id=eid;
   if e.financial_account_id<>p_account or e.signed_amount<>r.amount or e.related_operation_id is distinct from r.operation_id then raise exception 'La captura cambió; revisá su respaldo';end if;
  end if;
  update mp_bank_web_rows set prepared_entry_id=eid where id=r.id;
  insert into bank_import_batch_rows(batch_id,sheet_row,source,entry_id,result) values(bid,pos,row_source,eid,'valid');
  if r.amount>0 then incoming:=incoming+r.amount*100;else outgoing:=outgoing-r.amount*100;end if;
 end loop;
 select jsonb_build_object('rows',pos,'valid',pos,'operations',count(distinct operation_id),'incoming',incoming,'outgoing',outgoing,'net',incoming-outgoing,'from',min((occurred_at at time zone 'America/Argentina/Buenos_Aires')::date),'to',max((occurred_at at time zone 'America/Argentina/Buenos_Aires')::date),'origin','web','coverage','loaded_rows_only') into v_totals from mp_bank_web_rows where id::text in(select value from jsonb_array_elements_text(p_ids));
 update bank_import_batches set totals=v_totals where id=bid;
 insert into bank_statement_events(batch_id,action,after_value,actor_id) values(bid,'web.prepared',jsonb_build_object('rows',pos,'financialWrites',0),p_actor);
 perform sync_bank_statement_orders(p_actor,bid);
 return bid;
end $$;
do $$ begin if to_regprocedure('public.ingest_bank_statement_before_v176(uuid,jsonb,jsonb)') is null then alter function public.ingest_bank_statement(uuid,jsonb,jsonb) rename to ingest_bank_statement_before_v176;end if;end $$;
create or replace function public.ingest_bank_statement(p_actor uuid,p_meta jsonb,p_rows jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;rows jsonb:='[]';ids uuid[];eid uuid;official uuid;count_web integer;account uuid;bid uuid;updated integer:=0;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));account:=(p_meta->>'accountId')::uuid;
 if exists(select 1 from bank_import_batches where financial_account_id=account and file_hash=p_meta->>'hash') then return ingest_bank_statement_before_v176(p_actor,p_meta,p_rows);end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r->'errors')='array' and jsonb_array_length(r->'errors')=0 then
   select array_agg(e.id) into ids from bank_statement_entries e where e.financial_account_id=account and e.source->>'origin'='web' and e.related_operation_id=r->>'operationId' and e.signed_amount=(r->>'amount')::numeric and date_trunc('minute',e.occurred_at)=date_trunc('minute',(r->>'occurredAt')::timestamptz);
   if coalesce(array_length(ids,1),0)>0 then
    select id into official from bank_statement_entries where financial_account_id=account and external_movement_id=r->>'movementId';
    select count(*) into count_web from mp_bank_web_rows w join bank_statement_mp_accounts m on m.mp_account_id=w.mp_account_id where m.financial_account_id=account and w.operation_id=r->>'operationId' and w.amount=(r->>'amount')::numeric and date_trunc('minute',w.occurred_at at time zone 'America/Argentina/Buenos_Aires')=date_trunc('minute',(r->>'occurredAt')::timestamptz at time zone 'UTC');
    if array_length(ids,1)=1 and official is null and count_web=1 and (select count(*) from jsonb_array_elements(p_rows) q where q->>'operationId'=r->>'operationId' and q->>'amount'=r->>'amount' and date_trunc('minute',(q->>'occurredAt')::timestamptz)=date_trunc('minute',(r->>'occurredAt')::timestamptz))=1 then
     eid:=ids[1];
     update bank_statement_entries set external_movement_id=r->>'movementId',source_date=r->>'sourceDate',occurred_at=(r->>'occurredAt')::timestamptz,effective_date=(r->>'date')::date,description=r->>'description',source=r||jsonb_build_object('origin','workbook','webCaptureId',source->>'webCaptureId','webOriginalSource',source),version=version+1 where id=eid;
     update mp_bank_web_rows set statement_entry_id=eid where prepared_entry_id=eid;updated:=updated+1;
    else
     r:=jsonb_set(r,'{errors}',jsonb_build_array('Coincidencia ambigua con captura web. Requiere revisión; no se generó otro movimiento.'));
    end if;
   end if;
  end if;
  rows:=rows||jsonb_build_array(r);
 end loop;
 bid:=ingest_bank_statement_before_v176(p_actor,p_meta,rows);
 if updated>0 then insert into bank_statement_events(batch_id,action,after_value,actor_id) values(bid,'web.confirmed',jsonb_build_object('confirmed',updated,'financialWrites',0),p_actor);end if;
 return bid;
end $$;
revoke all on function public.ingest_bank_statement_before_v176(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ingest_bank_statement(uuid,jsonb,jsonb),public.create_bank_statement_from_web(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_bank_statement(uuid,jsonb,jsonb),public.create_bank_statement_from_web(uuid,uuid,jsonb) to service_role;
create or replace function public.reconcile_mp_bank_web(p_mp text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r mp_bank_web_rows;p mp_payments;pid text;eid uuid;n integer;linked integer:=0;activity_name text;activity_description text;reserve boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 for r in select * from mp_bank_web_rows where mp_account_id=p_mp order by id for update loop
  select count(*),min(x.id) into n,pid from mp_payments x where x.account_id=p_mp and x.amount=r.amount and r.amount>0 and x.is_verified is true
   and (lower(trim(r.description)) in ('cobro','dinero recibido','ingreso de dinero') or exists(select 1 from mp_bank_activity_rows a where a.mp_account_id=p_mp and a.amount=r.amount and date_trunc('minute',a.occurred_at)=date_trunc('minute',r.occurred_at) and not a.is_reserve and lower(trim(a.description)) in ('transferencia recibida','cobro')))
   and not exists(select 1 from mp_bank_activity_rows a where a.mp_account_id=p_mp and a.amount=r.amount and date_trunc('minute',a.occurred_at)=date_trunc('minute',r.occurred_at) and a.is_reserve)
   and not coalesce(x.is_hidden,false) and not coalesce(x.is_internal,false)
   and date_trunc('minute',x.received_at)=date_trunc('minute',r.occurred_at)
   and (x.mp_operation_id is null or x.mp_operation_id=r.operation_id);
  if n=1 and (select count(*) from mp_bank_web_rows x where x.mp_account_id=p_mp and x.amount=r.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',r.occurred_at))=1 then
   select * into strict p from mp_payments where id=pid for update;
   if p.mp_operation_id is null then update mp_payments set mp_operation_id=r.operation_id where id=pid and mp_operation_id is null;end if;
   update mp_bank_web_rows set payment_id=pid where id=r.id;linked:=linked+1;
  else update mp_bank_web_rows set payment_id=null where id=r.id;end if;
  select count(*),min(a.name),min(a.description),bool_or(a.is_reserve) into n,activity_name,activity_description,reserve from mp_bank_activity_rows a
   where a.mp_account_id=p_mp and a.amount=r.amount and date_trunc('minute',a.occurred_at)=date_trunc('minute',r.occurred_at);
  if n=1 then update mp_bank_web_rows set counterparty_name=activity_name,activity_type=activity_description,operation_kind=case when reserve then 'reserve_transfer' end where id=r.id;
  else update mp_bank_web_rows set counterparty_name=null,activity_type=null,operation_kind=null where id=r.id;end if;
  select count(*),min(e.id::text)::uuid into n,eid from bank_statement_entries e join bank_statement_mp_accounts m on m.financial_account_id=e.financial_account_id
   where m.mp_account_id=p_mp and e.source->>'origin' is distinct from 'web' and exists(select 1 from bank_import_batch_rows br join bank_import_batches b on b.id=br.batch_id where br.entry_id=e.id and br.result='valid' and b.deleted_at is null) and e.related_operation_id=r.operation_id and e.signed_amount=r.amount
   and date_trunc('minute',e.occurred_at at time zone 'UTC')=date_trunc('minute',r.occurred_at at time zone 'America/Argentina/Buenos_Aires');
  if n=1 and (select count(*) from mp_bank_web_rows x where x.mp_account_id=p_mp and x.operation_id=r.operation_id and x.amount=r.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',r.occurred_at))=1 then
   update mp_bank_web_rows set statement_entry_id=eid where id=r.id;
  else update mp_bank_web_rows set statement_entry_id=null where id=r.id;end if;
 end loop;
 update mp_bank_web_rows x set operation_kind='reserve_transfer' where x.mp_account_id=p_mp and exists(select 1 from mp_bank_web_rows a where a.mp_account_id=p_mp and a.operation_id=x.operation_id and a.operation_kind='reserve_transfer');
 return jsonb_build_object('matched',linked);
end;
$$;
notify pgrst,'reload schema';
commit;
