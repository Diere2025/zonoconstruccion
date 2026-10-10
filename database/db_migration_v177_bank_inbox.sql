begin;
alter table public.mp_bank_web_rows add column if not exists prepared_batch_id uuid references public.bank_import_batches(id);
alter table public.mp_bank_activity_rows add column if not exists operation_id text check(operation_id is null or operation_id ~ '^[0-9]{6,80}$');
alter table public.mp_bank_web_rows add column if not exists proposed_concept_id uuid references public.financial_concepts(id);
alter table public.mp_bank_web_rows add column if not exists review_version integer not null default 1;
alter table public.mp_bank_activity_rows add column if not exists proposed_concept_id uuid references public.financial_concepts(id);
alter table public.mp_bank_activity_rows add column if not exists review_version integer not null default 1;
create index if not exists mp_bank_activity_operation on public.mp_bank_activity_rows(mp_account_id,operation_id) where operation_id is not null;
create table if not exists public.mp_bank_activity_links (
 activity_id uuid primary key references public.mp_bank_activity_rows(id),cash_transaction_id uuid not null references public.cash_transactions(id),
 version integer not null default 1,linked_by uuid not null references auth.users(id),linked_at timestamptz not null default now()
);
create table if not exists public.mp_bank_reference_events (
 id bigint generated always as identity primary key,activity_id uuid not null references public.mp_bank_activity_rows(id),
 before_value jsonb,after_value jsonb,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.mp_bank_activity_links enable row level security;alter table public.mp_bank_reference_events enable row level security;
revoke all on public.mp_bank_activity_links,public.mp_bank_reference_events from public,anon,authenticated;
grant all on public.mp_bank_activity_links,public.mp_bank_reference_events to service_role;
grant usage,select on sequence public.mp_bank_reference_events_id_seq to service_role;
create or replace function public.enrich_mp_bank_reference_metadata(p_mp text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare activity_record mp_bank_activity_rows;w mp_bank_web_rows;n integer;op text;person text;kind text;
begin
 for activity_record in select * from mp_bank_activity_rows where mp_account_id=p_mp and operation_id is null loop
  select count(*),min(x.operation_id) into n,op from mp_bank_web_rows x where x.mp_account_id=p_mp and x.amount=activity_record.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',activity_record.occurred_at);
  if n=1 and (select count(*) from mp_bank_activity_rows x where x.mp_account_id=p_mp and x.amount=activity_record.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',activity_record.occurred_at))=1 then update mp_bank_activity_rows set operation_id=op where id=activity_record.id and operation_id is null;end if;
 end loop;
 for w in select * from mp_bank_web_rows where mp_account_id=p_mp loop
  select count(*),min(a.name),min(a.description) into n,person,kind from mp_bank_activity_rows a where a.mp_account_id=p_mp and a.operation_id=w.operation_id and date_trunc('minute',a.occurred_at)=date_trunc('minute',w.occurred_at) and (a.amount=w.amount or a.is_reserve and w.operation_kind='reserve_transfer');
  if n=1 and (select count(*) from mp_bank_web_rows x where x.mp_account_id=p_mp and x.operation_id=w.operation_id and x.amount=w.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',w.occurred_at))=1 then update mp_bank_web_rows set counterparty_name=person,activity_type=kind where id=w.id;end if;
 end loop;
end $$;
create or replace function public.sync_mp_bank_payment_reference(p_payment text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare eid uuid;oid uuid;owner uuid;p mp_payments;l bank_statement_order_links;
begin
 select * into p from mp_payments where id=p_payment;
 if not found or not p.is_verified or coalesce(p.is_hidden,false) or coalesce(p.is_internal,false) then return;end if;
 select case when count(distinct coalesce(w.statement_entry_id,w.prepared_entry_id))=1 then min(coalesce(w.statement_entry_id,w.prepared_entry_id)::text)::uuid end into eid
 from mp_bank_web_rows w join bank_statement_mp_accounts m on m.mp_account_id=w.mp_account_id
 join bank_statement_entries e on e.id=coalesce(w.statement_entry_id,w.prepared_entry_id) and e.financial_account_id=m.financial_account_id
 where w.payment_id=p_payment and w.mp_account_id=p.account_id and w.amount=p.amount and e.signed_amount=p.amount;
 if eid is null or not bank_statement_is_collection(eid) then return;end if;
 select * into l from bank_statement_order_links where entry_id=eid for update;
 if found and (l.kind='manual' or l.payment_id is distinct from p_payment) then return;end if;
 oid:=bank_statement_mp_order(p_payment);
 if oid is null then delete from bank_statement_order_links where entry_id=eid and kind='automatic' and payment_id=p_payment;return;end if;
 if exists(select 1 from bank_statement_order_links where payment_id=p_payment and entry_id<>eid) then return;end if;
 select b.created_by into owner from bank_import_batch_rows r join bank_import_batches b on b.id=r.batch_id where r.entry_id=eid and b.deleted_at is null order by b.created_at desc limit 1;
 if owner is null then return;end if;
 insert into bank_statement_order_links(entry_id,order_id,payment_id,kind,method,linked_by)
 values(eid,oid,p_payment,'automatic','payment_order',owner)
 on conflict(entry_id) do update set order_id=excluded.order_id,version=bank_statement_order_links.version+1,linked_at=now()
 where bank_statement_order_links.kind='automatic' and bank_statement_order_links.payment_id=p_payment and bank_statement_order_links.order_id is distinct from excluded.order_id;
end $$;
create table if not exists public.mp_bank_reference_retry (
 payment_id text primary key references public.mp_payments(id) on delete cascade,error_code text not null,queued_at timestamptz not null default now()
);
alter table public.mp_bank_reference_retry enable row level security;
revoke all on public.mp_bank_reference_retry from public,anon,authenticated;
grant all on public.mp_bank_reference_retry to service_role;
create or replace function public.mp_bank_payment_reference_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 begin perform sync_mp_bank_payment_reference(new.id);
 exception when others then insert into mp_bank_reference_retry(payment_id,error_code) values(new.id,SQLSTATE) on conflict(payment_id) do update set error_code=excluded.error_code,queued_at=now();end;
 return new;
end $$;
-- Only reference metadata changes: this trigger never creates a collection or a ledger entry.
drop trigger if exists mp_bank_order_reference on public.mp_payments;
create trigger mp_bank_order_reference after update of order_id,order_code on public.mp_payments for each row
when (old.order_id is distinct from new.order_id or old.order_code is distinct from new.order_code)
execute function public.mp_bank_payment_reference_trigger();
create or replace function public.classify_bank_activity_reference(p_actor uuid,p_activity uuid,p_concept uuid,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a mp_bank_activity_rows;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into strict a from mp_bank_activity_rows where id=p_activity for update;
 if a.review_version<>p_version then raise exception 'La actividad cambió. Volvé a cargar.' using errcode='40001';end if;
 if exists(select 1 from mp_bank_activity_links where activity_id=a.id) then raise exception 'El movimiento vinculado ya conserva su concepto administrativo';end if;
 if p_concept is not null and not exists(select 1 from financial_concepts where id=p_concept and is_active) then raise exception 'Concepto no disponible';end if;
 update mp_bank_activity_rows set proposed_concept_id=p_concept,review_version=review_version+1 where id=a.id;
 insert into mp_bank_reference_events(activity_id,before_value,after_value,actor_id) values(a.id,jsonb_build_object('concept',a.proposed_concept_id),jsonb_build_object('concept',p_concept),p_actor);
end $$;
create or replace function public.classify_bank_inbox_capture(p_actor uuid,p_capture uuid,p_concept uuid,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare w mp_bank_web_rows;eid uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict w from mp_bank_web_rows where id=p_capture for update;
 if w.review_version<>p_version then raise exception 'El ítem cambió. Volvé a cargar.' using errcode='40001';end if;
 eid:=coalesce(w.statement_entry_id,w.prepared_entry_id);
 if exists(select 1 from bank_entry_ledger_links where entry_id=eid) then raise exception 'El movimiento ya fue validado por administración. Sólo se enriquecen sus referencias.';end if;
 if p_concept is not null and not exists(select 1 from financial_concepts where id=p_concept and is_active) then raise exception 'Concepto no disponible';end if;
 update mp_bank_web_rows set proposed_concept_id=p_concept,review_version=review_version+1 where id=w.id;
 if eid is not null then update bank_statement_entries set financial_concept_id=p_concept,version=version+1 where id=eid;end if;
end $$;
create table if not exists public.mp_bank_inbox_settings (mp_account_id text primary key references public.mp_accounts(id),actor_id uuid not null references auth.users(id),configured_at timestamptz not null default now());
alter table public.mp_bank_inbox_settings enable row level security;revoke all on public.mp_bank_inbox_settings from public,anon,authenticated;grant all on public.mp_bank_inbox_settings to service_role;
create or replace function public.sync_mp_bank_inbox(p_mp text,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare account uuid;owner uuid;ids jsonb;bid uuid;n integer:=0;payment_ref record;entry_record record;description_key text;direction_key text;target_name text;concept_choice uuid;concept_count integer;
begin
 if p_actor is not null and not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select m.financial_account_id,coalesce(p_actor,i.actor_id,s.created_by,m.updated_by) into account,owner from bank_statement_mp_accounts m left join mp_bank_inbox_settings i on i.mp_account_id=m.mp_account_id left join bank_account_import_settings s on s.financial_account_id=m.financial_account_id where m.mp_account_id=p_mp;
 if account is null or owner is null then return jsonb_build_object('prepared',0,'pendingConfiguration',true);end if;
 if not can_manage_financial_operations(owner) then return jsonb_build_object('prepared',0,'pendingConfiguration',true);end if;
 if p_actor is not null then insert into mp_bank_inbox_settings(mp_account_id,actor_id) values(p_mp,p_actor) on conflict(mp_account_id) do update set actor_id=excluded.actor_id,configured_at=now();end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 perform reconcile_mp_bank_web(p_mp);
 perform enrich_mp_bank_reference_metadata(p_mp);
 select jsonb_agg(id::text) into ids from (select w.id from mp_bank_web_rows w where w.mp_account_id=p_mp and w.prepared_entry_id is null and w.statement_entry_id is null
 and w.occurred_at>='2026-10-01T00:00:00-03:00' and (select count(*) from mp_bank_web_rows x where x.mp_account_id=p_mp and x.operation_id=w.operation_id and x.amount=w.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',w.occurred_at))=1 order by w.occurred_at,w.id limit 1000) ready;
 if ids is not null then
  bid:=create_bank_statement_from_web(owner,account,ids);n:=jsonb_array_length(ids);
  update mp_bank_web_rows set prepared_batch_id=bid where id::text in(select value from jsonb_array_elements_text(ids));
 end if;
 update mp_bank_web_rows w set prepared_batch_id=(select b.id from bank_import_batch_rows r join bank_import_batches b on b.id=r.batch_id where r.entry_id=w.prepared_entry_id and b.deleted_at is null order by b.created_at desc limit 1) where w.mp_account_id=p_mp and w.prepared_entry_id is not null and w.prepared_batch_id is null;
 for entry_record in select e.id,e.description,e.signed_amount from bank_statement_entries e join mp_bank_web_rows w on w.prepared_entry_id=e.id where w.mp_account_id=p_mp and e.financial_concept_id is null and e.version=1 and w.review_version=1 and not exists(select 1 from bank_entry_ledger_links l where l.entry_id=e.id) loop
  description_key:=translate(lower(trim(entry_record.description)),'áéíóúüñ','aeiouun');direction_key:=case when entry_record.signed_amount>0 then 'ingreso' else 'egreso' end;
  select count(distinct financial_concept_id),min(financial_concept_id::text)::uuid into concept_count,concept_choice from bank_classification_rules where is_active and description=description_key and direction=direction_key and financial_account_id=account;
  if concept_count=0 then select count(distinct financial_concept_id),min(financial_concept_id::text)::uuid into concept_count,concept_choice from bank_classification_rules where is_active and description=description_key and direction=direction_key and financial_account_id is null;end if;
  if concept_count=0 then
   target_name:=case when direction_key='ingreso' and description_key in ('cobro','dinero recibido','ingreso de dinero') then 'Cobro' when direction_key='ingreso' and description_key in ('rendimiento bruto','rendimiento positivo de la inversion') then 'MP - Intereses Ganados' when direction_key='egreso' and description_key='costo de mercado pago' then 'Costo de Mercado Pago' when direction_key='egreso' and description_key='costo por intereses absorbidos' then 'Costo por intereses absorbidos' when direction_key='egreso' and description_key='retencion impuesto ingresos brutos no inscripto buenos aires' then 'Retenciones - IIBB' end;
   select count(*),min(id::text)::uuid into concept_count,concept_choice from financial_concepts where is_active and concept=target_name and (target_name<>'Cobro' or translate(lower(category),'áéíóúüñ','aeiouun')='recaudacion') and (target_name<>'MP - Intereses Ganados' or lower(category)='inversiones');
  end if;
  if concept_count=1 then update bank_statement_entries set financial_concept_id=concept_choice where id=entry_record.id and financial_concept_id is null;update mp_bank_web_rows set proposed_concept_id=concept_choice where prepared_entry_id=entry_record.id and proposed_concept_id is null;end if;
 end loop;
 for payment_ref in select distinct payment_id from mp_bank_web_rows where mp_account_id=p_mp and payment_id is not null loop perform sync_mp_bank_payment_reference(payment_ref.payment_id);delete from mp_bank_reference_retry where payment_id=payment_ref.payment_id;end loop;
 return jsonb_build_object('prepared',n,'financialWrites',0);
end $$;
do $$begin
 if to_regprocedure('public.capture_mp_bank_web_before_inbox(text,jsonb)') is null then alter function public.capture_mp_bank_web(text,jsonb) rename to capture_mp_bank_web_before_inbox;end if;
 if to_regprocedure('public.capture_mp_bank_activity_before_inbox(text,jsonb)') is null then alter function public.capture_mp_bank_activity(text,jsonb) rename to capture_mp_bank_activity_before_inbox;end if;
end $$;
create or replace function public.capture_mp_bank_web(p_mp text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin result:=capture_mp_bank_web_before_inbox(p_mp,p_rows);return result||jsonb_build_object('inbox',sync_mp_bank_inbox(p_mp));end $$;
create or replace function public.capture_mp_bank_activity(p_mp text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;r jsonb;stamp timestamptz;key text;
begin
 result:=capture_mp_bank_activity_before_inbox(p_mp,p_rows);
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'operationId' is not null then
   if r->>'operationId' !~ '^[0-9]{6,80}$' then raise exception 'Código de operación inválido';end if;
   stamp:=(r->>'occurredAt')::timestamptz;key:=md5(jsonb_build_array(stamp,(r->>'amount')::numeric,r->>'name',r->>'description',(r->>'occurrence')::int)::text);
   update mp_bank_activity_rows set operation_id=r->>'operationId' where mp_account_id=p_mp and capture_key=key and (operation_id is null or operation_id=r->>'operationId');
  end if;
 end loop;
 return result||jsonb_build_object('inbox',sync_mp_bank_inbox(p_mp));
end $$;
create or replace function public.bank_activity_targets(p_actor uuid,p_activity uuid,p_search text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a mp_bank_activity_rows;account uuid;result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into strict a from mp_bank_activity_rows where id=p_activity;
 select financial_account_id into strict account from bank_statement_mp_accounts where mp_account_id=a.mp_account_id;
 if length(p_search)>80 then raise exception 'Búsqueda demasiado larga';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select id,concept,movement_code,amount,created_at from cash_transactions x
 where x.financial_account_id=account and x.currency='ARS' and (case when x.type='ingreso' then x.amount else -x.amount end)=a.amount and bank_statement_active_transaction(x.id)
 and (case when length(trim(p_search))<2 then (x.created_at at time zone 'America/Argentina/Buenos_Aires')::date=(a.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date
 else x.concept ilike '%'||p_search||'%' or x.movement_code ilike '%'||p_search||'%' end) order by x.created_at desc limit 50) t;
 return result;
end $$;
create or replace function public.link_bank_activity_reference(p_actor uuid,p_activity uuid,p_transaction uuid,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a mp_bank_activity_rows;t cash_transactions;l mp_bank_activity_links;account uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into strict a from mp_bank_activity_rows where id=p_activity for update;
 if a.occurred_at<'2026-10-01T00:00:00-03:00' then raise exception 'Septiembre queda fuera del relevamiento';end if;
 select financial_account_id into strict account from bank_statement_mp_accounts where mp_account_id=a.mp_account_id;
 select * into l from mp_bank_activity_links where activity_id=a.id;
 if coalesce(l.version,0)<>p_version then raise exception 'La referencia cambió. Volvé a cargar.' using errcode='40001';end if;
 if p_transaction is not null then
  select * into strict t from cash_transactions where id=p_transaction;
  if t.financial_account_id<>account or t.currency<>'ARS' or not bank_statement_active_transaction(t.id) or (case when t.type='ingreso' then t.amount else -t.amount end)<>a.amount then raise exception 'El movimiento debe pertenecer a la cuenta y tener el mismo importe y signo';end if;
  insert into mp_bank_activity_links(activity_id,cash_transaction_id,linked_by) values(a.id,t.id,p_actor)
  on conflict(activity_id) do update set cash_transaction_id=excluded.cash_transaction_id,linked_by=p_actor,linked_at=now(),version=mp_bank_activity_links.version+1;
 else delete from mp_bank_activity_links where activity_id=a.id;end if;
 insert into mp_bank_reference_events(activity_id,before_value,after_value,actor_id) values(a.id,to_jsonb(l),jsonb_build_object('cash_transaction_id',p_transaction),p_actor);
end $$;
revoke all on function public.classify_bank_activity_reference(uuid,uuid,uuid,integer),public.classify_bank_inbox_capture(uuid,uuid,uuid,integer),public.enrich_mp_bank_reference_metadata(text),public.sync_mp_bank_inbox(text,uuid),public.sync_mp_bank_payment_reference(text),public.mp_bank_payment_reference_trigger(),public.capture_mp_bank_web(text,jsonb),public.capture_mp_bank_activity(text,jsonb),public.bank_activity_targets(uuid,uuid,text),public.link_bank_activity_reference(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.classify_bank_activity_reference(uuid,uuid,uuid,integer),public.classify_bank_inbox_capture(uuid,uuid,uuid,integer),public.enrich_mp_bank_reference_metadata(text),public.sync_mp_bank_inbox(text,uuid),public.sync_mp_bank_payment_reference(text),public.capture_mp_bank_web(text,jsonb),public.capture_mp_bank_activity(text,jsonb),public.bank_activity_targets(uuid,uuid,text),public.link_bank_activity_reference(uuid,uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
