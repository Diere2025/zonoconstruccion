begin;
alter table public.mp_payments add column if not exists mp_operation_id text;
create index if not exists mp_payments_operation_idx on public.mp_payments(account_id,mp_operation_id) where mp_operation_id is not null;
create table if not exists public.mp_bank_web_rows (
 id uuid primary key default gen_random_uuid(),mp_account_id text not null references public.mp_accounts(id),capture_key text not null,
 operation_id text not null check(operation_id ~ '^[0-9]{6,80}$'),occurred_at timestamptz not null,amount numeric(15,2) not null check(amount<>0),description text not null,
 occurrence integer not null default 1 check(occurrence between 1 and 200),payment_id text references public.mp_payments(id) on delete set null,
 statement_entry_id uuid references public.bank_statement_entries(id),first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),unique(mp_account_id,capture_key)
);
create table if not exists public.mp_bank_web_scans (
 id bigint generated always as identity primary key,mp_account_id text not null references public.mp_accounts(id),scanned_at timestamptz not null default now(),row_count integer not null,visible_from timestamptz,visible_to timestamptz,
 coverage text not null default 'loaded_rows_only' check(coverage='loaded_rows_only')
);
alter table public.mp_bank_web_rows enable row level security;alter table public.mp_bank_web_scans enable row level security;
revoke all on public.mp_bank_web_rows,public.mp_bank_web_scans from public,anon,authenticated;
grant all on public.mp_bank_web_rows,public.mp_bank_web_scans to service_role;grant usage,select on sequence public.mp_bank_web_scans_id_seq to service_role;
alter table public.mp_bank_web_rows add column if not exists counterparty_name text;
alter table public.mp_bank_web_rows add column if not exists activity_type text;
alter table public.mp_bank_web_rows add column if not exists operation_kind text;
create table if not exists public.mp_bank_activity_rows (
 id uuid primary key default gen_random_uuid(),mp_account_id text not null references public.mp_accounts(id),capture_key text not null,
 occurred_at timestamptz not null,amount numeric(15,2) not null,name text not null,description text not null,is_reserve boolean not null default false,last_seen_at timestamptz not null default now(),unique(mp_account_id,capture_key)
);
alter table public.mp_bank_activity_rows enable row level security;revoke all on public.mp_bank_activity_rows from public,anon,authenticated;grant all on public.mp_bank_activity_rows to service_role;
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
   where m.mp_account_id=p_mp and exists(select 1 from bank_import_batch_rows br join bank_import_batches b on b.id=br.batch_id where br.entry_id=e.id and br.result='valid' and b.deleted_at is null) and e.related_operation_id=r.operation_id and e.signed_amount=r.amount
   and date_trunc('minute',e.occurred_at at time zone 'UTC')=date_trunc('minute',r.occurred_at at time zone 'America/Argentina/Buenos_Aires');
  if n=1 and (select count(*) from mp_bank_web_rows x where x.mp_account_id=p_mp and x.operation_id=r.operation_id and x.amount=r.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',r.occurred_at))=1 then
   update mp_bank_web_rows set statement_entry_id=eid where id=r.id;
  else update mp_bank_web_rows set statement_entry_id=null where id=r.id;end if;
 end loop;
 update mp_bank_web_rows x set operation_kind='reserve_transfer' where x.mp_account_id=p_mp and exists(select 1 from mp_bank_web_rows a where a.mp_account_id=p_mp and a.operation_id=x.operation_id and a.operation_kind='reserve_transfer');
 return jsonb_build_object('matched',linked);
end;
$$;
create or replace function public.capture_mp_bank_web(p_mp text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;n integer:=0;t timestamptz;from_time timestamptz;to_time timestamptz;key text;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Captura inválida: hasta 200 filas.';end if;
 perform 1 from mp_accounts a join bank_statement_mp_accounts m on m.mp_account_id=a.id where a.id=p_mp and a.is_active;if not found then raise exception 'Cuenta de captura no configurada.';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'operationId' !~ '^[0-9]{6,80}$' or r->>'occurredAt' !~ '^202[0-9]-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00-03:00$'
   or r->>'amount' !~ '^-?[0-9]+\.[0-9]{2}$' or (r->>'amount')::numeric=0 or length(coalesce(r->>'description','')) not between 1 and 1000
   or coalesce((r->>'occurrence')::integer,0) not between 1 and 200 then raise exception 'Fila capturada inválida.';end if;
  t:=(r->>'occurredAt')::timestamptz;if (t at time zone 'America/Argentina/Buenos_Aires')::date<'2026-10-01' then continue;end if;
  key:=md5(jsonb_build_array(r->>'operationId',t,(r->>'amount')::numeric,r->>'description',(r->>'occurrence')::integer)::text);
  insert into mp_bank_web_rows(mp_account_id,capture_key,operation_id,occurred_at,amount,description,occurrence)
   values(p_mp,key,r->>'operationId',t,(r->>'amount')::numeric,r->>'description',(r->>'occurrence')::integer)
   on conflict(mp_account_id,capture_key) do update set last_seen_at=now();n:=n+1;from_time:=least(from_time,t);to_time:=greatest(to_time,t);
 end loop;
 insert into mp_bank_web_scans(mp_account_id,row_count,visible_from,visible_to) values(p_mp,n,from_time,to_time);
 perform reconcile_mp_bank_web(p_mp);
 return jsonb_build_object('captured',n,'coverage','loaded_rows_only','financialWrites',0);
end;
$$;
revoke all on function public.capture_mp_bank_web(text,jsonb),public.reconcile_mp_bank_web(text) from public,anon,authenticated;
grant execute on function public.capture_mp_bank_web(text,jsonb),public.reconcile_mp_bank_web(text) to service_role;
create or replace function public.capture_mp_bank_activity(p_mp text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;t timestamptz;n integer:=0;key text;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Captura inválida.';end if;
 perform 1 from mp_accounts a join bank_statement_mp_accounts m on m.mp_account_id=a.id where a.id=p_mp and a.is_active;if not found then raise exception 'Cuenta no configurada.';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'occurredAt' !~ '^202[0-9]-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00-03:00$' or r->>'amount' !~ '^-?[0-9]+\.[0-9]{2}$'
   or (r->>'amount')::numeric=0 or length(coalesce(r->>'name','')) not between 1 and 120 or length(coalesce(r->>'description','')) not between 1 and 200 or coalesce((r->>'occurrence')::int,0) not between 1 and 200 then raise exception 'Actividad inválida.';end if;
  t:=(r->>'occurredAt')::timestamptz;if (t at time zone 'America/Argentina/Buenos_Aires')::date<'2026-10-01' then continue;end if;
  key:=md5(jsonb_build_array(t,(r->>'amount')::numeric,r->>'name',r->>'description',(r->>'occurrence')::int)::text);
  insert into mp_bank_activity_rows(mp_account_id,capture_key,occurred_at,amount,name,description,is_reserve)
   values(p_mp,key,t,(r->>'amount')::numeric,r->>'name',r->>'description',lower(r->>'name') like '%reserva%' and lower(r->>'description') in ('dinero retirado','dinero ingresado'))
   on conflict(mp_account_id,capture_key) do update set last_seen_at=now();n:=n+1;
 end loop;
 perform reconcile_mp_bank_web(p_mp);return jsonb_build_object('captured',n,'financialWrites',0);
end;
$$;
revoke all on function public.capture_mp_bank_activity(text,jsonb) from public,anon,authenticated;
grant execute on function public.capture_mp_bank_activity(text,jsonb) to service_role;
create or replace function public.sync_bank_statement_orders(p_actor uuid,p_batch uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;p mp_payments;mp text;pid text;oid uuid;n integer;reciprocal integer;linked integer:=0;method text;has_exact boolean;has_minute boolean;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 select m.mp_account_id into mp from bank_statement_mp_accounts m join mp_accounts a on a.id=m.mp_account_id and a.is_active where m.financial_account_id=b.financial_account_id;
 if mp is null then return jsonb_build_object('linked',0,'reason','Configurar cuenta de Chequeo de Pagos');end if;
 for e in select x.* from bank_statement_entries x where exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=x.id and r.result='valid')
 and bank_statement_is_collection(x.id) and not exists(select 1 from bank_statement_order_links l where l.entry_id=x.id) order by x.id for update loop
  select exists(select 1 from mp_payments q where q.account_id=mp and (q.mp_operation_id=e.related_operation_id or q.id in (mp||'_'||e.related_operation_id,mp||'_'||e.external_movement_id))) into has_exact;
  select exists(select 1 from mp_payments q where q.account_id=mp and q.amount=e.signed_amount
   and q.is_verified is true and not coalesce(q.is_hidden,false) and not coalesce(q.is_internal,false)
   and bank_statement_payment_minute_matches(e.id,q.id)) into has_minute;
  method:=case when has_exact then 'operation' when has_minute then 'source_minute' else 'unique_amount_day' end;
  select count(*),min(q.id) into n,pid from mp_payments q where q.account_id=mp and q.amount=e.signed_amount
   and q.is_verified is true and not coalesce(q.is_hidden,false) and not coalesce(q.is_internal,false)
   and (q.received_at at time zone 'America/Argentina/Buenos_Aires')::date between e.effective_date-1 and e.effective_date
   and (not has_exact or (q.mp_operation_id=e.related_operation_id or q.id in (mp||'_'||e.related_operation_id,mp||'_'||e.external_movement_id)))
   and (has_exact or not has_minute or bank_statement_payment_minute_matches(e.id,q.id));
  if n<>1 then continue;end if;
  select * into strict p from mp_payments where id=pid for update;
  if p.account_id<>mp or p.amount<>e.signed_amount or p.is_verified is not true or coalesce(p.is_hidden,false) or coalesce(p.is_internal,false)
   or (p.received_at at time zone 'America/Argentina/Buenos_Aires')::date not between e.effective_date-1 and e.effective_date then continue;end if;
  if not has_exact and has_minute and not bank_statement_payment_minute_matches(e.id,pid) then continue;end if;
  oid:=bank_statement_mp_order(pid);if oid is null or exists(select 1 from bank_statement_order_links where payment_id=pid) then continue;end if;
  -- Reciprocal uniqueness includes all active extracts, even unclassified or already resolved collections.
  select count(*) into reciprocal from bank_statement_entries x where x.financial_account_id=e.financial_account_id and x.signed_amount=e.signed_amount
   and bank_statement_is_collection(x.id) and exists(select 1 from bank_import_batch_rows r join bank_import_batches z on z.id=r.batch_id where r.entry_id=x.id and r.result='valid' and z.deleted_at is null)
   and (p.received_at at time zone 'America/Argentina/Buenos_Aires')::date between x.effective_date-1 and x.effective_date
   and (not has_exact or (p.mp_operation_id=x.related_operation_id or pid in (mp||'_'||x.related_operation_id,mp||'_'||x.external_movement_id)))
   and (has_exact or not has_minute or bank_statement_payment_minute_matches(x.id,pid));
  if reciprocal<>1 then continue;end if;
  perform 1 from orders where id=oid for update;if bank_statement_mp_order(pid) is distinct from oid then continue;end if;
  insert into bank_statement_order_links(entry_id,order_id,payment_id,kind,method,linked_by) values(e.id,oid,pid,'automatic',method,p_actor);
  insert into bank_statement_events(batch_id,entry_id,action,after_value,actor_id) values(b.id,e.id,'order.auto_linked',jsonb_build_object('order',oid,'payment',pid,'method',method),p_actor);linked:=linked+1;
 end loop;
 return jsonb_build_object('linked',linked);
end;
$$;


commit;
