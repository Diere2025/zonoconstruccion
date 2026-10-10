begin;

create table if not exists public.bank_import_batches (
 id uuid primary key default gen_random_uuid(), provider text not null default 'mercadopago' check(provider='mercadopago'),
 financial_account_id uuid not null references public.financial_accounts(id), filename text not null,
 file_hash text not null check(file_hash ~ '^[0-9a-f]{64}$'), storage_path text not null,
 parser_version text not null, date_policy text not null check(date_policy='source-calendar-v1'),
 totals jsonb not null, version integer not null default 1, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(), unique(provider,financial_account_id,file_hash)
);
create table if not exists public.bank_statement_entries (
 id uuid primary key default gen_random_uuid(), provider text not null default 'mercadopago' check(provider='mercadopago'),
 financial_account_id uuid not null references public.financial_accounts(id), external_movement_id text not null check(external_movement_id ~ '^[0-9]{1,80}$'),
 related_operation_id text, source_date text not null, occurred_at timestamptz not null, effective_date date not null,
 description text not null, signed_amount numeric(15,2) not null check(abs(signed_amount)<1e12), source jsonb not null,
 financial_concept_id uuid references public.financial_concepts(id), resolution text not null default 'pending' check(resolution in ('pending','new','link')),
 target_transaction_id uuid references public.cash_transactions(id), resolution_reason text,
 version integer not null default 1, created_at timestamptz not null default clock_timestamp(),
 unique(provider,financial_account_id,external_movement_id)
);
create index if not exists bank_statement_group_idx on public.bank_statement_entries(financial_account_id,related_operation_id,effective_date);
create table if not exists public.bank_import_batch_rows (
 batch_id uuid not null references public.bank_import_batches(id), sheet_row integer not null,
 source jsonb not null, entry_id uuid references public.bank_statement_entries(id),
 result text not null check(result in ('valid','error','conflict','duplicate')), primary key(batch_id,sheet_row)
);
create index if not exists bank_batch_entry_idx on public.bank_import_batch_rows(entry_id);
create table if not exists public.bank_entry_ledger_links (
 entry_id uuid primary key references public.bank_statement_entries(id), cash_transaction_id uuid not null unique references public.cash_transactions(id) on delete restrict,
 kind text not null check(kind in ('created','adopted')), created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.bank_statement_events (
 id bigint generated always as identity primary key, batch_id uuid references public.bank_import_batches(id), entry_id uuid references public.bank_statement_entries(id),
 action text not null, before_value jsonb, after_value jsonb, actor_id uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.bank_statement_requests (
 actor_id uuid not null references auth.users(id), request_key uuid not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp(), primary key(actor_id,request_key)
);
create table if not exists public.bank_classification_rules (
 id uuid primary key default gen_random_uuid(), provider text not null default 'mercadopago' check(provider='mercadopago'),
 financial_account_id uuid references public.financial_accounts(id), description text not null, direction text not null check(direction in ('ingreso','egreso')),
 financial_concept_id uuid not null references public.financial_concepts(id), version integer not null default 1,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(), is_active boolean not null default true
);
create unique index if not exists bank_rules_scope_idx on public.bank_classification_rules(provider,coalesce(financial_account_id,'00000000-0000-0000-0000-000000000000'::uuid),description,direction) where is_active;
create table if not exists public.bank_account_import_settings (
 financial_account_id uuid primary key references public.financial_accounts(id), direct_from date not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.bank_balance_checkpoints (
 id uuid primary key default gen_random_uuid(), financial_account_id uuid not null references public.financial_accounts(id), effective_date date not null,
 reported_amount numeric(15,2) not null, reference text not null check(length(trim(reference)) between 3 and 500),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp()
);

-- The application reads and writes through authenticated server routes only.
do $$ declare t text; begin
 foreach t in array array['bank_import_batches','bank_statement_entries','bank_import_batch_rows','bank_entry_ledger_links','bank_statement_events','bank_statement_requests','bank_classification_rules','bank_account_import_settings','bank_balance_checkpoints'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.bank_statement_events_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bank-statements','bank-statements',false,2097152,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.bank_statement_active_transaction(p_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from cash_transactions t left join financial_operations o on o.id=t.operation_id
 where t.id=p_id and t.reversal_of_transaction_id is null and coalesce(o.status,'posted')='posted'
 and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id));
$$;
create or replace function public.bank_statement_candidates(p_entry uuid,p_net boolean default false)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with entry as (select * from bank_statement_entries where id=p_entry), amount as (
  select case when p_net then (select sum(e.signed_amount) from bank_statement_entries e
   where e.financial_account_id=x.financial_account_id and e.related_operation_id=x.related_operation_id) else x.signed_amount end value,x.* from entry x
 ), candidates as (
 select t.id,t.concept,t.amount::text amount,t.created_at,t.movement_code,t.operation_id
 from amount e join cash_transactions t on t.financial_account_id=e.financial_account_id and t.currency='ARS'
 and t.type=case when e.value>0 then 'ingreso' else 'egreso' end and t.amount=abs(e.value)
 and (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date between e.effective_date-3 and e.effective_date+3
 where e.value<>0 and (not p_net or (e.related_operation_id is not null and e.value<>e.signed_amount))
 and bank_statement_active_transaction(t.id) and not exists(select 1 from bank_entry_ledger_links l where l.cash_transaction_id=t.id)
 order by t.created_at,t.id limit 30
 ) select coalesce(jsonb_agg(to_jsonb(candidates)),'[]'::jsonb) from candidates;
$$;

create or replace function public.ingest_bank_statement(p_actor uuid,p_meta jsonb,p_rows jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches; e bank_statement_entries; r jsonb; rid uuid; state text; seen uuid[]:='{}'; a financial_accounts;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para importar extractos.' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'El extracto admite entre 1 y 1000 filas.';end if;
 select * into strict a from financial_accounts where id=(p_meta->>'accountId')::uuid for update;
 if not a.is_active or a.currency<>'ARS' or a.type not in ('banco','virtual') or a.name !~* '^Cuenta[. ]MP([0-9]+|Caro)$' then raise exception 'Seleccioná una cuenta Mercado Pago activa en ARS.';end if;
 if p_meta->>'hash' !~ '^[0-9a-f]{64}$' or p_meta->>'datePolicy'<>'source-calendar-v1' or length(coalesce(p_meta->>'filename','')) not between 1 and 240
 or p_meta->>'storagePath' is distinct from (a.id::text||'/'||(p_meta->>'hash')||'.xlsx') then raise exception 'Archivo inválido.';end if;
 select * into b from bank_import_batches where provider='mercadopago' and financial_account_id=a.id and file_hash=p_meta->>'hash';
 if found then return b.id;end if;
 insert into bank_import_batches(financial_account_id,filename,file_hash,storage_path,parser_version,date_policy,totals,created_by)
 values(a.id,p_meta->>'filename',p_meta->>'hash',p_meta->>'storagePath',p_meta->>'parserVersion',p_meta->>'datePolicy',p_meta->'totals',p_actor) returning * into b;
 for r in select value from jsonb_array_elements(p_rows) loop
  rid:=null;state:='error';
  if jsonb_typeof(r->'errors') is distinct from 'array' then raise exception 'Fila sin validación.';end if;
  if jsonb_array_length(r->'errors')=0 then
   if coalesce(r->>'movementId','') !~ '^[0-9]{1,80}$' or coalesce(r->>'amount','') !~ '^-?[0-9]+\.[0-9]{2}$'
    or abs((r->>'amount')::numeric)>=1e12 or length(trim(coalesce(r->>'description','')))=0
    or (r->>'date')::date is distinct from left(r->>'sourceDate',10)::date then raise exception 'Fila de extracto inválida.';end if;
   select * into e from bank_statement_entries where provider='mercadopago' and financial_account_id=a.id and external_movement_id=r->>'movementId' for update;
   if found then
    rid:=e.id;
    state:=case when e.source_date is distinct from r->>'sourceDate' or e.description is distinct from r->>'description'
     or e.signed_amount is distinct from (r->>'amount')::numeric or e.related_operation_id is distinct from nullif(r->>'operationId','') then 'conflict' else 'valid' end;
   else
    insert into bank_statement_entries(financial_account_id,external_movement_id,related_operation_id,source_date,occurred_at,effective_date,description,signed_amount,source)
    values(a.id,r->>'movementId',nullif(r->>'operationId',''),r->>'sourceDate',(r->>'occurredAt')::timestamptz,(r->>'date')::date,r->>'description',(r->>'amount')::numeric,r) returning id into rid;
    state:='valid';
   end if;
   if state='valid' and rid=any(seen) then state:='duplicate';end if;
   seen:=array_append(seen,rid);
  end if;
  insert into bank_import_batch_rows(batch_id,sheet_row,source,entry_id,result) values(b.id,(r->>'row')::int,r,rid,state);
 end loop;
 insert into bank_statement_events(batch_id,action,after_value,actor_id) values(b.id,'ingest',jsonb_build_object('filename',b.filename,'totals',b.totals),p_actor);
 return b.id;
end;
$$;

create or replace function public.decide_bank_statement(p_actor uuid,p_batch uuid,p_version integer,p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;d jsonb;old jsonb;v_concept_id uuid;choice text;target uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select * into strict b from bank_import_batches where id=p_batch for update;
 if b.version is distinct from p_version then raise exception 'El lote cambió. Actualizá la revisión.' using errcode='40001';end if;
 if jsonb_typeof(p_decisions) is distinct from 'array' or jsonb_array_length(p_decisions) not between 1 and 1000 then raise exception 'Selección inválida.';end if;
 for d in select value from jsonb_array_elements(p_decisions) order by value->>'id' loop
  select * into strict e from bank_statement_entries where id=(d->>'id')::uuid for update;
  if e.financial_account_id<>b.financial_account_id or not exists(select 1 from bank_import_batch_rows br where br.batch_id=b.id and br.entry_id=e.id and br.result='valid') then raise exception 'La fila no pertenece a este lote.';end if;
  if e.version is distinct from (d->>'version')::int then raise exception 'La fila cambió. Actualizá la revisión.' using errcode='40001';end if;
  if exists(select 1 from bank_entry_ledger_links where entry_id=e.id) then raise exception 'Editá el movimiento registrado desde Movimientos.';end if;
  old:=to_jsonb(e);v_concept_id:=nullif(d->>'conceptId','')::uuid;choice:=coalesce(d->>'resolution',e.resolution);target:=nullif(d->>'targetId','')::uuid;
  if v_concept_id is not null and not exists(select 1 from financial_concepts where id=v_concept_id and is_active) then raise exception 'Concepto no disponible.';end if;
  if choice not in ('pending','new','link') or (choice='link' and target is null) then raise exception 'Resolución inválida.';end if;
  if choice='new' and (jsonb_array_length(bank_statement_candidates(e.id))>0 or jsonb_array_length(bank_statement_candidates(e.id,true))>0) and length(trim(coalesce(d->>'reason','')))<3 then raise exception 'Explicá por qué es un movimiento diferente.';end if;
  if choice='link' and not exists(select 1 from cash_transactions t where t.id=target and t.financial_account_id=e.financial_account_id and t.currency='ARS'
   and t.amount=abs(e.signed_amount) and t.type=case when e.signed_amount>0 then 'ingreso' else 'egreso' end and bank_statement_active_transaction(t.id)
   and (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date between e.effective_date-3 and e.effective_date+3) then raise exception 'El movimiento elegido no coincide con la fila.';end if;
  update bank_statement_entries set financial_concept_id=v_concept_id,resolution=choice,target_transaction_id=case when choice='link' then target end,
   resolution_reason=nullif(trim(d->>'reason'),''),version=version+1 where id=e.id;
  insert into bank_statement_events(batch_id,entry_id,action,before_value,after_value,actor_id)
   values(b.id,e.id,'decision',old,d,p_actor);
 end loop;
 update bank_import_batches set version=version+1 where id=b.id returning * into b;
 return jsonb_build_object('version',b.version);
end;
$$;

create or replace function public.commit_bank_statement(p_actor uuid,p_key uuid,p_batch uuid,p_version integer,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;c financial_concepts;t cash_transactions;a financial_accounts;pm uuid;
 req bank_statement_requests; payload jsonb; result jsonb; item jsonb;op uuid;tx uuid;created int:=0;linked int:=0;skipped int:=0;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if p_key is null or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 1000 then raise exception 'Selección inválida.';end if;
 payload:=jsonb_build_object('batch',p_batch,'version',p_version,'entries',p_entries);
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into req from bank_statement_requests where actor_id=p_actor and request_key=p_key;
 if found then if req.payload<>payload then raise exception 'La solicitud ya se usó con otros datos.' using errcode='23505';end if;return req.result;end if;
 select * into strict b from bank_import_batches where id=p_batch for update;
 if b.version is distinct from p_version then raise exception 'El lote cambió. Actualizá la revisión.' using errcode='40001';end if;
 select * into strict a from financial_accounts where id=b.financial_account_id for update;
 if not a.is_active or a.currency<>'ARS' or a.type not in ('banco','virtual') then raise exception 'Cuenta no disponible.';end if;
 select id into pm from payment_methods where lower(name) like '%mercado%' or lower(name) like '%transferencia%' order by case when lower(name) like '%mercado%' then 0 else 1 end,id limit 1;
 if pm is null then raise exception 'Configurá el medio de pago Mercado Pago o Transferencia.';end if;
 perform set_config('zono.financial_write','on',true);
 for item in select value from jsonb_array_elements(p_entries) order by value->>'id' loop
  select * into strict e from bank_statement_entries where id=(item->>'id')::uuid for update;
  if e.financial_account_id<>a.id or not exists(select 1 from bank_import_batch_rows br where br.batch_id=b.id and br.entry_id=e.id and br.result='valid') then raise exception 'Fila ajena o en conflicto.';end if;
  if exists(select 1 from bank_entry_ledger_links where entry_id=e.id) then skipped:=skipped+1;continue;end if;
  if e.version is distinct from (item->>'version')::int then raise exception 'La fila cambió. Actualizá la revisión.' using errcode='40001';end if;
  if e.signed_amount=0 then skipped:=skipped+1;continue;end if;
  if e.resolution<>'link' and not exists(select 1 from bank_account_import_settings where financial_account_id=a.id) then raise exception 'Configurá el corte de importación directa antes de registrar filas nuevas.';end if;
  if e.resolution<>'link' and exists(select 1 from bank_account_import_settings s where s.financial_account_id=a.id and e.effective_date<s.direct_from) then raise exception 'La fila es anterior al corte de esta cuenta; revisá el histórico antes de importar.';end if;
  if e.resolution='link' then
   select * into strict t from cash_transactions where id=e.target_transaction_id for update;
   if not bank_statement_active_transaction(t.id) or t.financial_account_id<>a.id or t.currency<>'ARS' or t.amount<>abs(e.signed_amount)
    or t.type<>(case when e.signed_amount>0 then 'ingreso' else 'egreso' end)
    or (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date not between e.effective_date-3 and e.effective_date+3 then raise exception 'La coincidencia cambió o fue anulada.' using errcode='40001';end if;
   insert into bank_entry_ledger_links(entry_id,cash_transaction_id,kind,created_by) values(e.id,t.id,'adopted',p_actor);
   tx:=t.id;linked:=linked+1;
  else
   if (jsonb_array_length(bank_statement_candidates(e.id))>0 or jsonb_array_length(bank_statement_candidates(e.id,true))>0)
    and (e.resolution<>'new' or length(coalesce(e.resolution_reason,''))<3) then raise exception 'Resolvé la coincidencia antes de registrar.';end if;
   select * into c from financial_concepts where id=e.financial_concept_id and is_active;
   if not found then raise exception 'Clasificá la fila antes de registrarla; podés conservarla pendiente.';end if;
   if length(c.concept)>240 or length(trim(c.category))=0 then raise exception 'El concepto no admite registro.';end if;
   insert into financial_operations(operation_type,effective_date,detail,origin,created_by)
    values('general',e.effective_date,jsonb_build_object('reference',e.external_movement_id),'bank-statement',p_actor) returning id into op;
   insert into cash_transactions(type,category,sub_category,efe_category,financial_concept_id,business_unit,amount,currency,exchange_rate,concept,notes,
    created_at,created_by,payment_method_id,financial_account_id,is_imported,bank_import_key,operation_id,operation_line)
    values(case when e.signed_amount>0 then 'ingreso' else 'egreso' end,c.category,nullif(c.sub_category,''),nullif(c.efe_category,''),c.id,'ZONO',abs(e.signed_amount),'ARS',1,c.concept,
     'Extracto Mercado Pago · movimiento '||e.external_movement_id||coalesce(' · operación '||e.related_operation_id,''),
     (e.effective_date+time '12:00') at time zone 'America/Argentina/Buenos_Aires',p_actor,pm,a.id,true,'bank-statement:'||e.id,op,'main') returning id into tx;
   insert into financial_operation_events(operation_id,action,after_value,reason,actor_id) values(op,'bank.import',jsonb_build_object('entry_id',e.id,'transaction_id',tx),'Importación de extracto',p_actor);
   insert into bank_entry_ledger_links(entry_id,cash_transaction_id,kind,created_by) values(e.id,tx,'created',p_actor);
   created:=created+1;
  end if;
  insert into bank_statement_events(batch_id,entry_id,action,after_value,actor_id) values(b.id,e.id,'commit',jsonb_build_object('transaction_id',tx),p_actor);
 end loop;
 update bank_import_batches set version=version+1 where id=b.id;
 result:=jsonb_build_object('created',created,'linked',linked,'skipped',skipped);
 insert into bank_statement_requests(actor_id,request_key,payload,result) values(p_actor,p_key,payload,result);
 perform set_config('zono.financial_write','off',true);
 return result;
end;
$$;

-- Original extract evidence must remain consistent after edits through any API.
create or replace function public.guard_bank_statement_money()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from bank_entry_ledger_links where cash_transaction_id=old.id) then
  if tg_op='DELETE' then raise exception 'El movimiento tiene un extracto vinculado; usá la anulación financiera.';end if;
  if new.amount is distinct from old.amount or new.type is distinct from old.type or new.financial_account_id is distinct from old.financial_account_id
   or new.currency is distinct from old.currency or new.created_at is distinct from old.created_at or new.reversal_of_transaction_id is distinct from old.reversal_of_transaction_id then
   raise exception 'El dinero del extracto es inmutable; corregí por el circuito de anulación.';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists guard_bank_statement_money on public.cash_transactions;
create trigger guard_bank_statement_money before update or delete on public.cash_transactions for each row execute function public.guard_bank_statement_money();

create or replace function public.configure_bank_statement_account(p_actor uuid,p_account uuid,p_from date)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform 1 from financial_accounts where id=p_account and is_active and currency='ARS' and type in ('banco','virtual') and name ~* '^Cuenta[. ]MP([0-9]+|Caro)$' for update;
 if not found or p_from is null then raise exception 'Cuenta o fecha inválida.';end if;
 if exists(select 1 from bank_account_import_settings where financial_account_id=p_account) then raise exception 'El corte ya está configurado; su corrección requiere revisión del histórico.';end if;
 insert into bank_account_import_settings(financial_account_id,direct_from,created_by) values(p_account,p_from,p_actor);
 insert into bank_statement_events(action,after_value,actor_id) values('account.cutover',jsonb_build_object('account',p_account,'from',p_from),p_actor);
end;
$$;

-- Preserve the legacy implementation; reject migrated accounts at the DB boundary.
do $$ begin
 if to_regprocedure('public.import_bank_movements_legacy_v166(uuid,jsonb)') is null then
  alter function public.import_bank_movements(uuid,jsonb) rename to import_bank_movements_legacy_v166;
 end if;
end $$;
create or replace function public.import_bank_movements(p_actor uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Filas inválidas.';end if;
 -- Serialize cutover with both import routes.
 perform 1 from financial_accounts where id in (select (value->>'accountId')::uuid from jsonb_array_elements(p_rows)) order by id for update;
 if exists(select 1 from jsonb_array_elements(p_rows) r join bank_account_import_settings s on s.financial_account_id=(r->>'accountId')::uuid) then
  raise exception 'Esta cuenta usa extractos directos y ya no admite importación desde Sheets.';
 end if;
 return import_bank_movements_legacy_v166(p_actor,p_rows);
end;
$$;
revoke all on function public.import_bank_movements_legacy_v166(uuid,jsonb) from public,anon,authenticated,service_role;

do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('bank_statement_active_transaction','bank_statement_candidates','ingest_bank_statement','decide_bank_statement','commit_bank_statement','configure_bank_statement_account','import_bank_movements') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
revoke all on function public.guard_bank_statement_money() from public,anon,authenticated;

-- Review is evaluated from current ledger state, including later reversals.
create or replace function public.review_bank_statement(p_actor uuid,p_batch uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;entries jsonb;checkpoint jsonb;
begin
 if not can_manage_treasury_settlements(p_actor) and not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select * into strict b from bank_import_batches where id=p_batch;
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('signed_amount',e.signed_amount::text,
  'link',case when l.entry_id is null then null else jsonb_build_object('cash_transaction_id',l.cash_transaction_id,'kind',l.kind,
   'reversed',not bank_statement_active_transaction(t.id),'concept',t.concept,'movement_code',t.movement_code) end,
  'candidates',case when l.entry_id is null then bank_statement_candidates(e.id) else '[]'::jsonb end,
  'netCandidates',case when l.entry_id is null then bank_statement_candidates(e.id,true) else '[]'::jsonb end)
  order by e.occurred_at,e.external_movement_id),'[]'::jsonb) into entries
 from bank_statement_entries e left join bank_entry_ledger_links l on l.entry_id=e.id left join cash_transactions t on t.id=l.cash_transaction_id
 where exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=e.id);
 select jsonb_build_object('effective_date',c.effective_date,'reported_amount',c.reported_amount::text,'reference',c.reference,
  'ledger_amount',(select coalesce(sum(case when t.type='ingreso' then t.amount else -t.amount end),0)::text from cash_transactions t
   where t.financial_account_id=b.financial_account_id and t.created_at<((c.effective_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')))
 into checkpoint from bank_balance_checkpoints c where c.financial_account_id=b.financial_account_id order by c.effective_date desc,c.created_at desc limit 1;
 return jsonb_build_object('batch',to_jsonb(b),'entries',entries,'checkpoint',checkpoint);
end;
$$;
create or replace function public.save_bank_statement_rule(p_actor uuid,p_account uuid,p_description text,p_direction text,p_concept uuid,p_version integer default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r bank_classification_rules;rid uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform 1 from financial_accounts where id=p_account and is_active for update;if not found then raise exception 'Cuenta no disponible.';end if;
 if length(trim(p_description)) not between 3 and 1000 or p_description in ('pago','retiro de dinero','movimiento general','ingreso de dinero','dinero recibido','cobro') or p_direction not in ('ingreso','egreso') then raise exception 'El texto no permite una regla específica; clasificá cada fila.';end if;
 perform 1 from financial_concepts where id=p_concept and is_active;if not found then raise exception 'Concepto no disponible.';end if;
 select * into r from bank_classification_rules where financial_account_id=p_account and description=p_description and direction=p_direction and is_active for update;
 if found then
  if p_version is distinct from r.version then raise exception 'La regla cambió. Actualizá la revisión.' using errcode='40001';end if;
  update bank_classification_rules set financial_concept_id=p_concept,version=version+1 where id=r.id returning id into rid;
 else
  if p_version is not null then raise exception 'La regla ya no existe.' using errcode='40001';end if;
  insert into bank_classification_rules(financial_account_id,description,direction,financial_concept_id,created_by) values(p_account,p_description,p_direction,p_concept,p_actor) returning id into rid;
 end if;
 insert into bank_statement_events(action,before_value,after_value,actor_id) values('rule.save',to_jsonb(r),jsonb_build_object('rule_id',rid,'concept_id',p_concept,'description',p_description),p_actor);
 return rid;
end;
$$;
create or replace function public.save_bank_balance_checkpoint(p_actor uuid,p_account uuid,p_date date,p_amount numeric,p_reference text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform 1 from financial_accounts where id=p_account and is_active and currency='ARS' for update;if not found then raise exception 'Cuenta no disponible.';end if;
 if p_date is null or p_amount is null or p_amount<>round(p_amount,2) or abs(p_amount)>=1e12 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Saldo inválido.';end if;
 insert into bank_balance_checkpoints(financial_account_id,effective_date,reported_amount,reference,created_by) values(p_account,p_date,p_amount,trim(p_reference),p_actor) returning id into rid;
 insert into bank_statement_events(action,after_value,actor_id) values('balance.reported',jsonb_build_object('account',p_account,'date',p_date,'amount',p_amount,'reference',p_reference),p_actor);
 return rid;
end;
$$;
revoke all on function public.review_bank_statement(uuid,uuid),public.save_bank_statement_rule(uuid,uuid,text,text,uuid,integer),public.save_bank_balance_checkpoint(uuid,uuid,date,numeric,text) from public,anon,authenticated;
grant execute on function public.review_bank_statement(uuid,uuid),public.save_bank_statement_rule(uuid,uuid,text,text,uuid,integer),public.save_bank_balance_checkpoint(uuid,uuid,date,numeric,text) to service_role;

notify pgrst,'reload schema';
commit;
