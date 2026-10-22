begin;
create table if not exists public.finanzaspro_sync_config(
 id boolean primary key default true check(id),enabled boolean not null default false,
 from_date date not null default '2026-10-01',person_id uuid not null references financial_classification_items(id),
 destination_url text not null check(destination_url ~ '^https://[a-z0-9]+\.supabase\.co$'),destination_key text not null,
 firebase_project text not null default 'finanzaspro-2-b28cb'
);
create table if not exists public.finanzaspro_extraction_outbox(
 transaction_id uuid primary key,payload jsonb not null,fingerprint text not null,revision bigint not null default 1,
 delivered_revision bigint not null default 0,request_id bigint,sent_revision bigint,sent_at timestamptz,
 last_error text,attempts integer not null default 0,next_attempt_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table finanzaspro_sync_config enable row level security;
alter table finanzaspro_extraction_outbox enable row level security;
revoke all on finanzaspro_sync_config,finanzaspro_extraction_outbox from public,anon,authenticated;
grant select on finanzaspro_sync_config,finanzaspro_extraction_outbox to service_role;

create or replace function public.refresh_finanzaspro_extractions() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg finanzaspro_sync_config;v record;n integer:=0;value jsonb;kind text;
begin
 select * into cfg from finanzaspro_sync_config where id;
 if not found then return 0;end if;
 for v in
  select t.*,a.name account,s.value classification,p.person_id preset_person,
   (select r.kind from mp_reserve_ledger_links l join mp_reserve_web_rows r on r.id=l.reserve_row_id join mp_reserve_accounts c on c.mp_account_id=r.mp_account_id and c.reserve_id=r.reserve_id where l.cash_transaction_id=t.id and c.enabled and c.mp_account_id in ('diegozono_mp','pagoszono_26') and r.kind='deposit') reserve_kind,
   (select string_agg(distinct nullif(btrim(x.name),''),' / ' order by nullif(btrim(x.name),'')) from bank_entry_ledger_links bl join mp_bank_web_rows w on coalesce(w.statement_entry_id,w.prepared_entry_id)=bl.entry_id join mp_bank_activity_rows x on x.mp_account_id=w.mp_account_id and x.amount=w.amount and not x.is_reserve and ((x.operation_id=w.operation_id and (x.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date=(w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date) or date_trunc('minute',x.occurred_at)=date_trunc('minute',w.occurred_at)) where bl.cash_transaction_id=t.id) counterparty
  from cash_transactions t left join financial_accounts a on a.id=t.financial_account_id
  left join financial_classification_snapshots s on s.transaction_id=t.id
  left join financial_classification_items p on p.legacy_concept_id=t.financial_concept_id and p.kind='preset'
  where (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=cfg.from_date
   and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions rev where rev.reversal_of_transaction_id=t.id)
   and (t.operation_id is null or exists(select 1 from financial_operations o where o.id=t.operation_id and o.status='posted'))
   and ((t.type='egreso' and t.category='Extracciones' and
    (s.value->>'person'=(select name from financial_classification_items where id=cfg.person_id)
     or (coalesce(s.value->>'person','')='' and p.person_id=cfg.person_id)))
    or (t.type='ingreso' and exists(select 1 from mp_reserve_ledger_links l join mp_reserve_web_rows r on r.id=l.reserve_row_id join mp_reserve_accounts c on c.mp_account_id=r.mp_account_id and c.reserve_id=r.reserve_id where l.cash_transaction_id=t.id and c.enabled and c.mp_account_id in ('diegozono_mp','pagoszono_26') and r.kind='deposit')))
 loop
  kind:=case when v.reserve_kind='deposit' then 'reserve_funding' else 'extraction' end;
  value:=jsonb_build_object('transaction_id',v.id,'active',true,'kind',kind,'date',(v.created_at at time zone 'America/Argentina/Buenos_Aires')::date,'occurred_at',v.created_at,
   'amount',v.amount,'currency',v.currency,'account',v.account,'movement_code',v.movement_code,'person','Diego Bóveda',
   'concept',regexp_replace(coalesce(v.classification->>'concept',v.concept,''),'(?:[0-9][ -]?){13,19}','[tarjeta]','g'),
   'detail',regexp_replace(coalesce(v.classification->>'detail',v.sub_category,''),'(?:[0-9][ -]?){13,19}','[tarjeta]','g'),
   'destination',coalesce(v.classification->>'destination',''),'counterparty',v.counterparty,'created_by',v.created_by,'registered_at',v.registered_at);
  insert into finanzaspro_extraction_outbox(transaction_id,payload,fingerprint) values(v.id,value,md5(value::text))
   on conflict(transaction_id) do update set payload=excluded.payload,fingerprint=excluded.fingerprint,revision=finanzaspro_extraction_outbox.revision+1,updated_at=now(),next_attempt_at=now()
   where finanzaspro_extraction_outbox.fingerprint<>excluded.fingerprint;
  n:=n+1;
 end loop;
 -- Previously delivered movements remain traceable when reversed, deleted or reclassified.
 update finanzaspro_extraction_outbox o set payload=jsonb_set(o.payload,'{active}','false'),fingerprint=md5(jsonb_set(o.payload,'{active}','false')::text),revision=revision+1,updated_at=now(),next_attempt_at=now()
 where o.payload->>'active'='true' and not exists(
  select 1 from cash_transactions t left join financial_classification_snapshots s on s.transaction_id=t.id left join financial_classification_items p on p.legacy_concept_id=t.financial_concept_id and p.kind='preset'
  where t.id=o.transaction_id and (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=cfg.from_date and t.reversal_of_transaction_id is null
   and not exists(select 1 from cash_transactions rev where rev.reversal_of_transaction_id=t.id)
   and (t.operation_id is null or exists(select 1 from financial_operations x where x.id=t.operation_id and x.status='posted'))
   and ((t.type='egreso' and t.category='Extracciones' and (s.value->>'person'=(select name from financial_classification_items where id=cfg.person_id) or (coalesce(s.value->>'person','')='' and p.person_id=cfg.person_id)))
    or (t.type='ingreso' and exists(select 1 from mp_reserve_ledger_links l join mp_reserve_web_rows r on r.id=l.reserve_row_id join mp_reserve_accounts c on c.mp_account_id=r.mp_account_id and c.reserve_id=r.reserve_id where l.cash_transaction_id=t.id and r.kind='deposit' and c.enabled and c.mp_account_id in ('diegozono_mp','pagoszono_26')))));
 return n;
end $$;

create or replace function public.dispatch_finanzaspro_extractions() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg finanzaspro_sync_config;o finanzaspro_extraction_outbox;response record;request bigint;n integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('finanzaspro_dispatch',0)) then return 0;end if;
 select * into cfg from finanzaspro_sync_config where id and enabled;if not found then return 0;end if;
 perform refresh_finanzaspro_extractions();
 for o in select * from finanzaspro_extraction_outbox where request_id is not null loop
  select * into response from net._http_response where id=o.request_id;
  if found then
   if response.status_code between 200 and 299 and not coalesce(response.timed_out,false) and response.error_msg is null then
    update finanzaspro_extraction_outbox set delivered_revision=greatest(delivered_revision,o.sent_revision),request_id=null,last_error=null where transaction_id=o.transaction_id;
   else
    update finanzaspro_extraction_outbox set request_id=null,last_error=left(coalesce(response.error_msg,'HTTP '||response.status_code::text),300),next_attempt_at=now()+interval '1 minute' * least(30,greatest(1,attempts)) where transaction_id=o.transaction_id;
   end if;
  elsif o.sent_at<now()-interval '3 minutes' then
   update finanzaspro_extraction_outbox set request_id=null,last_error='Respuesta vencida; se reintentará' where transaction_id=o.transaction_id;
  end if;
 end loop;
 for o in select * from finanzaspro_extraction_outbox where delivered_revision<revision and request_id is null and next_attempt_at<=now() order by updated_at,transaction_id limit 30 loop
  request:=net.http_post(url:=cfg.destination_url||'/rest/v1/rpc/receive_zono_extraction',headers:=jsonb_build_object('Content-Type','application/json','apikey',cfg.destination_key,'Authorization','Bearer '||cfg.destination_key),
   body:=jsonb_build_object('p_source',o.transaction_id,'p_revision',o.revision,'p_payload',o.payload),timeout_milliseconds:=15000);
  update finanzaspro_extraction_outbox set request_id=request,sent_revision=revision,sent_at=now(),attempts=attempts+1 where transaction_id=o.transaction_id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function refresh_finanzaspro_extractions(),dispatch_finanzaspro_extractions() from public,anon,authenticated;
grant execute on function refresh_finanzaspro_extractions(),dispatch_finanzaspro_extractions() to service_role;
notify pgrst,'reload schema';
commit;
