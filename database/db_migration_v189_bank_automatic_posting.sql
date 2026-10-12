begin;
alter table public.mp_bank_inbox_settings add column if not exists automatic_from timestamptz;
alter table public.bank_statement_entries add column if not exists auto_posted_at timestamptz;
alter table public.cash_transactions add column if not exists bank_review_status text check(bank_review_status in ('pending','reviewed'));
alter table public.cash_transactions add column if not exists bank_reviewed_at timestamptz;
alter table public.cash_transactions add column if not exists bank_reviewed_by uuid references auth.users(id);
create or replace function public.configure_bank_auto_posting(p_actor uuid,p_account uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare mp text;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select mp_account_id into strict mp from bank_statement_mp_accounts where financial_account_id=p_account;
 if not exists(select 1 from bank_account_import_settings where financial_account_id=p_account) then raise exception 'Falta configurar el origen de la cuenta.';end if;
 insert into mp_bank_inbox_settings(mp_account_id,actor_id,automatic_from) values(mp,p_actor,case when p_enabled then date_trunc('minute',clock_timestamp()) end)
 on conflict(mp_account_id) do update set actor_id=excluded.actor_id,automatic_from=case when p_enabled then coalesce(mp_bank_inbox_settings.automatic_from,excluded.automatic_from) end;
 insert into bank_statement_events(action,after_value,actor_id) values('automatic.configure',jsonb_build_object('account',p_account,'enabled',p_enabled),p_actor);
end $$;
create or replace function public.auto_post_bank_inbox(p_mp text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare account financial_accounts; owner uuid; since timestamptz; pm uuid; r record; c financial_concepts; op uuid; tx uuid; created integer:=0;concept_count integer;concept_choice uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select a.*,i.actor_id,i.automatic_from into r from financial_accounts a join bank_statement_mp_accounts m on m.financial_account_id=a.id join mp_bank_inbox_settings i on i.mp_account_id=m.mp_account_id where m.mp_account_id=p_mp;
 if not found or r.automatic_from is null then return jsonb_build_object('created',0,'automatic',false);end if;
 owner:=r.actor_id;since:=r.automatic_from;select * into account from financial_accounts where id=r.id for update;
 if not can_manage_financial_operations(owner) or not account.is_active or account.currency<>'ARS' or account.type not in ('banco','virtual') then raise exception 'Cuenta automática no disponible.';end if;
 select id into pm from payment_methods where lower(name) like '%mercado%' or lower(name) like '%transferencia%' order by case when lower(name) like '%mercado%' then 0 else 1 end,id limit 1;
 if pm is null then raise exception 'Falta el medio de pago Mercado Pago o Transferencia.';end if;
 -- A late Activity reference may identify an already-applied unclassified
 -- capture. Only untouched, unreviewed classifications can be filled automatically.
 for r in select w.* from mp_bank_web_rows w join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) join cash_transactions t on t.id=l.cash_transaction_id
 where w.mp_account_id=p_mp and w.review_version=1 and t.bank_review_status='pending' and t.financial_concept_id is null loop
  select count(distinct option_id),min(option_id::text)::uuid into concept_count,concept_choice from bank_classification_rules b cross join lateral unnest(array[b.financial_concept_id]||b.alternative_concept_ids) option_id
  where b.is_active and b.direction=case when r.amount>0 then 'ingreso' else 'egreso' end and b.financial_account_id=account.id and b.description in (bank_reference_key(r.counterparty_name),bank_reference_key(r.activity_type),bank_reference_key(r.description));
  if concept_count=0 then
   select count(distinct option_id),min(option_id::text)::uuid into concept_count,concept_choice from bank_classification_rules b cross join lateral unnest(array[b.financial_concept_id]||b.alternative_concept_ids) option_id
   where b.is_active and b.direction=case when r.amount>0 then 'ingreso' else 'egreso' end and b.financial_account_id is null and b.description in (bank_reference_key(r.counterparty_name),bank_reference_key(r.activity_type),bank_reference_key(r.description));
  end if;
  if r.operation_kind='reserve_transfer' then select count(*),min(id::text)::uuid into concept_count,concept_choice from financial_concepts where is_active and concept='Movimiento de cuentas' and category='Movimiento de cuentas';end if;
  if concept_count=1 and exists(select 1 from financial_concepts where id=concept_choice and is_active) then perform classify_bank_inbox_capture(owner,r.id,concept_choice,r.review_version);end if;
 end loop;
 perform set_config('zono.financial_write','on',true);
 for r in select e.*,w.id capture_id,w.occurred_at original_time,w.prepared_batch_id batch_id from bank_statement_entries e join mp_bank_web_rows w on coalesce(w.statement_entry_id,w.prepared_entry_id)=e.id
 where w.mp_account_id=p_mp and w.occurred_at>=since and e.signed_amount<>0
 and exists(select 1 from bank_account_import_settings s where s.financial_account_id=e.financial_account_id and e.effective_date>=s.direct_from)
 and exists(select 1 from bank_import_batches b join bank_import_batch_rows br on br.batch_id=b.id where b.id=w.prepared_batch_id and b.deleted_at is null and br.entry_id=e.id and br.result='valid')
 and not exists(select 1 from bank_entry_ledger_links l where l.entry_id=e.id)
 and e.resolution in ('pending','new')
 and (select count(*) from mp_bank_web_rows x where x.mp_account_id=w.mp_account_id and x.operation_id=w.operation_id and x.amount=w.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',w.occurred_at))=1
 order by e.id limit 1000 for update of e,w loop
  if r.financial_account_id<>account.id then raise exception 'Cuenta de captura inconsistente.';end if;
  select * into c from financial_concepts where id=r.financial_concept_id and is_active;
  if not found then c.id:=null;c.concept:='Sin clasificar';c.category:='Sin clasificar';c.sub_category:=null;c.efe_category:=null;end if;
  if length(c.concept)>240 or length(trim(c.category))=0 then raise exception 'Concepto inválido.';end if;
  insert into financial_operations(operation_type,effective_date,detail,origin,created_by) values('general',r.effective_date,jsonb_build_object('reference',r.external_movement_id,'automatic',true),'bank-statement',owner) returning id into op;
  insert into cash_transactions(type,category,sub_category,efe_category,financial_concept_id,business_unit,amount,currency,exchange_rate,concept,notes,created_at,created_by,payment_method_id,financial_account_id,is_imported,bank_import_key,operation_id,operation_line,bank_review_status)
  values(case when r.signed_amount>0 then 'ingreso' else 'egreso' end,c.category,nullif(c.sub_category,''),nullif(c.efe_category,''),c.id,'ZONO',abs(r.signed_amount),'ARS',1,c.concept,'Extracto Mercado Pago · movimiento '||r.external_movement_id||coalesce(' · operación '||r.related_operation_id,''),r.original_time,owner,pm,account.id,true,'bank-statement:'||r.id,op,'main','pending') returning id into tx;
  insert into bank_entry_ledger_links(entry_id,cash_transaction_id,kind,created_by) values(r.id,tx,'created',owner);
  update bank_statement_entries set auto_posted_at=clock_timestamp(),version=version+1 where id=r.id;
  insert into bank_statement_events(batch_id,entry_id,action,after_value,actor_id) values(r.batch_id,r.id,'automatic.post',jsonb_build_object('transaction_id',tx,'review_status','pending'),owner);
  insert into financial_operation_events(operation_id,action,after_value,reason,actor_id) values(op,'bank.automatic',jsonb_build_object('entry_id',r.id,'transaction_id',tx),'Captura bancaria automática',owner);
  created:=created+1;
 end loop;
 perform set_config('zono.financial_write','off',true);
 for r in select distinct payment_id from mp_bank_web_rows where mp_account_id=p_mp and payment_id is not null loop perform sync_mp_bank_payment_reference(r.payment_id);end loop;
 return jsonb_build_object('created',created,'automatic',true);
end $$;
do $$begin if to_regprocedure('public.sync_mp_bank_inbox_before_v189(text,uuid)') is null then alter function public.sync_mp_bank_inbox(text,uuid) rename to sync_mp_bank_inbox_before_v189;end if;end $$;
create or replace function public.sync_mp_bank_inbox(p_mp text,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; posted jsonb;
begin result:=sync_mp_bank_inbox_before_v189(p_mp,p_actor);posted:=auto_post_bank_inbox(p_mp);return result||jsonb_build_object('automatic',posted->'automatic','created',posted->'created','financialWrites',posted->'created');end $$;
-- Classification changes category and concept only. The bank amount/account/date stay immutable.
create or replace function public.classify_bank_inbox_capture(p_actor uuid,p_capture uuid,p_concept uuid,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare w mp_bank_web_rows; eid uuid; t cash_transactions; c financial_concepts;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict w from mp_bank_web_rows where id=p_capture for update;
 if w.review_version<>p_version then raise exception 'El ítem cambió. Volvé a cargar.' using errcode='40001';end if;
 eid:=coalesce(w.statement_entry_id,w.prepared_entry_id);
 select cash.* into t from cash_transactions cash join bank_entry_ledger_links l on l.cash_transaction_id=cash.id where l.entry_id=eid for update of cash;
 if found and t.bank_review_status is null then raise exception 'El movimiento ya fue validado por administración.';end if;
 if t.id is not null and not bank_statement_active_transaction(t.id) then raise exception 'El movimiento fue anulado.';end if;
 select * into c from financial_concepts where id=p_concept and is_active;
 if p_concept is not null and not found then raise exception 'Concepto no disponible';end if;
 update mp_bank_web_rows set proposed_concept_id=p_concept,review_version=review_version+1 where id=w.id;
 if eid is not null then update bank_statement_entries set financial_concept_id=p_concept,version=version+1 where id=eid;end if;
 if t.id is not null then
  perform set_config('zono.financial_write','on',true);
  update cash_transactions set financial_concept_id=p_concept,concept=coalesce(c.concept,'Sin clasificar'),category=coalesce(c.category,'Sin clasificar'),sub_category=nullif(c.sub_category,''),efe_category=nullif(c.efe_category,'') where id=t.id;
  update financial_operations set version=version+1,updated_at=clock_timestamp() where id=t.operation_id;
  perform set_config('zono.financial_write','off',true);
  insert into financial_operation_events(operation_id,action,before_value,after_value,reason,actor_id) values(t.operation_id,'bank.classify',jsonb_build_object('concept',t.financial_concept_id),jsonb_build_object('concept',p_concept),'Clasificación posterior sin alterar la caja',p_actor);
 end if;
 insert into bank_statement_events(entry_id,action,after_value,actor_id) values(eid,'classify',jsonb_build_object('concept',p_concept,'transaction_id',t.id),p_actor);
end $$;
create or replace function public.review_bank_inbox_capture(p_actor uuid,p_capture uuid,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare w mp_bank_web_rows; t cash_transactions;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict w from mp_bank_web_rows where id=p_capture for update;
 if w.review_version<>p_version then raise exception 'El ítem cambió. Volvé a cargar.' using errcode='40001';end if;
 select cash.* into strict t from cash_transactions cash join bank_entry_ledger_links l on l.cash_transaction_id=cash.id where l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) for update of cash;
 if t.bank_review_status is null or not bank_statement_active_transaction(t.id) then raise exception 'Movimiento no revisable.';end if;
 update cash_transactions set bank_review_status='reviewed',bank_reviewed_at=clock_timestamp(),bank_reviewed_by=p_actor where id=t.id;
 update mp_bank_web_rows set review_version=review_version+1 where id=w.id;
 insert into bank_statement_events(entry_id,action,after_value,actor_id) values(coalesce(w.statement_entry_id,w.prepared_entry_id),'review',jsonb_build_object('transaction_id',t.id),p_actor);
end $$;
revoke all on function public.sync_mp_bank_inbox_before_v189(text,uuid),public.auto_post_bank_inbox(text) from public,anon,authenticated,service_role;
revoke all on function public.sync_mp_bank_inbox(text,uuid),public.configure_bank_auto_posting(uuid,uuid,boolean),public.classify_bank_inbox_capture(uuid,uuid,uuid,integer),public.review_bank_inbox_capture(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.sync_mp_bank_inbox(text,uuid),public.configure_bank_auto_posting(uuid,uuid,boolean),public.classify_bank_inbox_capture(uuid,uuid,uuid,integer),public.review_bank_inbox_capture(uuid,uuid,integer) to service_role;

-- Review counts include applied automatic entries, independently of their classification.
create or replace function public.bank_inbox_pending_before(p_account uuid,p_from date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('count',count(*),'from',min((w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date),'to',max((w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date))
 from mp_bank_web_rows w join bank_statement_mp_accounts m on m.mp_account_id=w.mp_account_id
 left join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) left join cash_transactions t on t.id=l.cash_transaction_id
 where m.financial_account_id=p_account and w.occurred_at>='2026-09-30T00:00:00-03:00'::timestamptz and w.occurred_at<(p_from::timestamp at time zone 'America/Argentina/Buenos_Aires') and (l.entry_id is null or t.bank_review_status='pending');
$$;
-- The already-authenticated monitor polls every ten seconds. Automatic accounts
-- request a bank refresh each minute without requiring a click in the ERP.
do $$begin if to_regprocedure('public.poll_mp_capture_refresh_before_v189(text,text)') is null then alter function public.poll_mp_capture_refresh(text,text) rename to poll_mp_capture_refresh_before_v189;end if;end $$;
create or replace function public.poll_mp_capture_refresh(p_account text,p_channel text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare job jsonb; owner uuid; day date;
begin
 job:=poll_mp_capture_refresh_before_v189(p_account,p_channel);
 if p_channel='banking' and (job is null or job='null'::jsonb) then
  select actor_id into owner from mp_bank_inbox_settings where mp_account_id=p_account and automatic_from is not null;
  if owner is not null and can_manage_financial_operations(owner) and not exists(select 1 from mp_capture_refresh_requests where account_id=p_account and channel='banking' and created_at>now()-interval '60 seconds') then
   day:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
   perform request_mp_capture_refresh(p_account,'banking',owner,false,day,day);
   job:=poll_mp_capture_refresh_before_v189(p_account,p_channel);
  end if;
 end if;
 return job;
end $$;
do $$begin if to_regprocedure('public.capture_mp_bank_activity_before_v189(text,jsonb)') is null then alter function public.capture_mp_bank_activity(text,jsonb) rename to capture_mp_bank_activity_before_v189;end if;end $$;
create or replace function public.capture_mp_bank_activity(p_mp text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;owner uuid;since timestamptz;n integer;day date;
begin
 select actor_id,automatic_from into owner,since from mp_bank_inbox_settings where mp_account_id=p_mp;
 select count(*) into n from mp_bank_activity_rows where mp_account_id=p_mp and occurred_at>=since;
 result:=capture_mp_bank_activity_before_v189(p_mp,p_rows);
 if since is not null and can_manage_financial_operations(owner) and (select count(*) from mp_bank_activity_rows where mp_account_id=p_mp and occurred_at>=since)>n then
  day:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
  perform request_mp_capture_refresh(p_mp,'banking',owner,false,day,day);
 end if;
 return result;
end $$;
revoke all on function public.poll_mp_capture_refresh_before_v189(text,text),public.capture_mp_bank_activity_before_v189(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.poll_mp_capture_refresh(text,text),public.capture_mp_bank_activity(text,jsonb),public.bank_inbox_pending_before(uuid,date) from public,anon,authenticated;
grant execute on function public.poll_mp_capture_refresh(text,text),public.capture_mp_bank_activity(text,jsonb),public.bank_inbox_pending_before(uuid,date) to service_role;

notify pgrst,'reload schema';
commit;
