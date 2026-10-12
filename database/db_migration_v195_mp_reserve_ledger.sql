begin;
create table if not exists public.mp_reserve_accounts (
 mp_account_id text not null references mp_accounts(id),reserve_id uuid not null,main_account_id uuid not null references financial_accounts(id),reserve_account_id uuid not null references financial_accounts(id),
 actor_id uuid not null references auth.users(id),enabled boolean not null default true,history_from date not null default '2026-09-28',created_at timestamptz not null default now(),
 primary key(mp_account_id,reserve_id),unique(reserve_account_id),check(main_account_id<>reserve_account_id)
);
create table if not exists public.mp_reserve_ledger_links (
 reserve_row_id uuid primary key references mp_reserve_web_rows(id),cash_transaction_id uuid not null unique references cash_transactions(id),
 bank_capture_id uuid references mp_bank_web_rows(id),counterpart_transaction_id uuid references cash_transactions(id),
 original_account_id uuid not null references financial_accounts(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table if not exists public.mp_reserve_ledger_events (
 id bigint generated always as identity primary key,reserve_row_id uuid not null references mp_reserve_web_rows(id),cash_transaction_id uuid not null references cash_transactions(id),
 before_value jsonb not null,after_value jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table mp_reserve_accounts enable row level security;alter table mp_reserve_ledger_links enable row level security;alter table mp_reserve_ledger_events enable row level security;
revoke all on mp_reserve_accounts,mp_reserve_ledger_links,mp_reserve_ledger_events from public,anon,authenticated;
grant all on mp_reserve_accounts,mp_reserve_ledger_links,mp_reserve_ledger_events to service_role;
grant usage,select on sequence mp_reserve_ledger_events_id_seq to service_role;
-- The only account reassignment permitted for statement-bound money is an
-- audited, evidence-bound relocation from the configured parent to its reserve.
create or replace function public.guard_bank_statement_money() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from bank_entry_ledger_links where cash_transaction_id=old.id) then
  if tg_op='DELETE' then raise exception 'El movimiento tiene un extracto vinculado; usá la anulación financiera.';end if;
  if new.amount is distinct from old.amount or new.type is distinct from old.type or new.currency is distinct from old.currency or new.created_at is distinct from old.created_at or new.reversal_of_transaction_id is distinct from old.reversal_of_transaction_id then raise exception 'El dinero del extracto es inmutable; corregí por el circuito de anulación.';end if;
  if new.financial_account_id is distinct from old.financial_account_id and not (
   coalesce(current_setting('zono.reserve_write',true),'')='on' and coalesce(current_setting('role',true),'none') not in ('authenticated','anon')
   and exists(select 1 from mp_reserve_ledger_links l join mp_reserve_web_rows r on r.id=l.reserve_row_id join mp_reserve_accounts c on c.mp_account_id=r.mp_account_id and c.reserve_id=r.reserve_id
    where l.cash_transaction_id=old.id and c.enabled and c.main_account_id=old.financial_account_id and c.reserve_account_id=new.financial_account_id and l.original_account_id=old.financial_account_id
    and abs(r.amount)=old.amount and (r.amount>0)=(old.type='ingreso'))
  ) then raise exception 'El dinero del extracto es inmutable; corregí por el circuito de anulación.';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create or replace function public.sync_mp_reserve_ledger(p_mp text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg mp_reserve_accounts;r mp_reserve_web_rows;t cash_transactions;c financial_concepts;n integer;bid uuid;tx uuid;peer uuid;op uuid;changed integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 for cfg in select * from mp_reserve_accounts where mp_account_id=p_mp and enabled loop
  if not can_manage_financial_operations(cfg.actor_id) or not exists(select 1 from financial_accounts where id=cfg.reserve_account_id and is_active and currency='ARS' and type in ('virtual','banco')) then raise exception 'Caja de reserva no disponible';end if;
  for r in select w.* from mp_reserve_web_rows w where w.mp_account_id=p_mp and w.reserve_id=cfg.reserve_id and (w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date>=cfg.history_from and not exists(select 1 from mp_reserve_ledger_links l where l.reserve_row_id=w.id) order by w.occurred_at,w.id for update loop
   tx:=null;bid:=null;peer:=null;
   -- Repeated indistinguishable reserve events require review, never guessing.
   if (select count(*) from mp_reserve_web_rows x where x.mp_account_id=p_mp and x.reserve_id=r.reserve_id and x.kind=r.kind and x.amount=r.amount and x.occurred_at=r.occurred_at)<>1 then continue;end if;
   select count(*),min(w.id::text)::uuid into n,bid from mp_bank_web_rows w where w.mp_account_id=p_mp and w.occurred_at=r.occurred_at and w.amount=r.amount
    and (case when r.kind='yield' then w.description ~* 'rendimiento|intereses' else w.operation_kind='reserve_transfer' end);
   if n=1 then
    select l.cash_transaction_id into tx from mp_bank_web_rows w join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) where w.id=bid;
    if r.kind<>'yield' then
     select count(*),min(l.cash_transaction_id::text)::uuid into n,peer from mp_bank_web_rows w join mp_bank_web_rows matched on matched.id=bid join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id)
      where w.mp_account_id=p_mp and w.operation_id=matched.operation_id and w.operation_kind='reserve_transfer' and w.occurred_at=r.occurred_at and w.amount=-r.amount;
     if n<>1 then continue;end if;
    end if;
   elsif n=0 and (r.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date<'2026-09-30' then
    bid:=null;
    select count(*),min(x.id::text)::uuid into n,tx from cash_transactions x where x.financial_account_id=cfg.main_account_id and x.currency='ARS' and x.amount=abs(r.amount) and x.type=case when r.amount>0 then 'ingreso' else 'egreso' end
     and (x.created_at at time zone 'America/Argentina/Buenos_Aires')::date=(r.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date
     and x.concept=case when r.kind='yield' then 'MP - Intereses Ganados' else 'Movimiento de cuentas' end;
    if n<>1 then continue;end if;
    if r.kind<>'yield' then
     select count(*),min(x.id::text)::uuid into n,peer from cash_transactions x where x.financial_account_id=cfg.main_account_id and x.currency='ARS' and x.amount=abs(r.amount) and x.type=case when r.amount>0 then 'egreso' else 'ingreso' end
      and (x.created_at at time zone 'America/Argentina/Buenos_Aires')::date=(r.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date and x.concept='Movimiento de cuentas';
     if n<>1 then continue;end if;
    end if;
   else continue;end if;
   if tx is null or exists(select 1 from mp_reserve_ledger_links where cash_transaction_id=tx) then continue;end if;
   select * into strict t from cash_transactions where id=tx for update;
   if t.financial_account_id<>cfg.main_account_id or t.amount<>abs(r.amount) or t.type<>(case when r.amount>0 then 'ingreso' else 'egreso' end) or t.currency<>'ARS' or t.reversal_of_transaction_id is not null or exists(select 1 from cash_transactions where reversal_of_transaction_id=t.id) then raise exception 'Movimiento de reserva inconsistente';end if;
   if peer is not null and not exists(select 1 from cash_transactions x where x.id=peer and x.financial_account_id=cfg.main_account_id and x.amount=t.amount and x.type<>t.type and x.currency=t.currency and x.reversal_of_transaction_id is null) then raise exception 'Contraparte de reserva inconsistente';end if;
   select * into strict c from financial_concepts where is_active and concept=case when r.kind='yield' then 'MP - Intereses Ganados' else 'Movimiento de cuentas' end and category=case when r.kind='yield' then 'Inversiones' else 'Movimiento de cuentas' end;
   if t.operation_id is not null then perform 1 from financial_operations where id=t.operation_id and status='posted' for update;if not found then raise exception 'Operación anulada';end if;end if;
   insert into mp_reserve_ledger_links(reserve_row_id,cash_transaction_id,bank_capture_id,counterpart_transaction_id,original_account_id,created_by) values(r.id,t.id,bid,peer,cfg.main_account_id,cfg.actor_id);
   perform set_config('zono.reserve_write','on',true);perform set_config('zono.financial_write','on',true);
   update cash_transactions set financial_account_id=cfg.reserve_account_id,financial_concept_id=c.id,concept=c.concept,category=c.category,sub_category=nullif(c.sub_category,''),efe_category=nullif(c.efe_category,'') where id=t.id;
   perform set_config('zono.reserve_write','off',true);perform set_config('zono.financial_write','off',true);
   if t.operation_id is not null then update financial_operations set version=version+1,updated_at=clock_timestamp() where id=t.operation_id;
    insert into financial_operation_events(operation_id,action,before_value,after_value,reason,actor_id) values(t.operation_id,'reserve.allocate',jsonb_build_object('account',cfg.main_account_id),jsonb_build_object('account',cfg.reserve_account_id,'reserve_row',r.id),'Asignación de movimiento existente a su caja de reserva',cfg.actor_id);end if;
   insert into mp_reserve_ledger_events(reserve_row_id,cash_transaction_id,before_value,after_value,actor_id) values(r.id,t.id,to_jsonb(t),(select to_jsonb(x) from cash_transactions x where x.id=t.id),cfg.actor_id);
   -- Source entries remain attached to the originating MP account; only their
   -- classification is synchronized if a reserve transfer was misclassified.
   update bank_statement_entries e set financial_concept_id=c.id,version=version+1 from bank_entry_ledger_links l where l.entry_id=e.id and l.cash_transaction_id=t.id and e.financial_concept_id is distinct from c.id;
   update mp_bank_web_rows w set proposed_concept_id=c.id,review_version=review_version+1 where w.id=bid and w.proposed_concept_id is distinct from c.id;
   changed:=changed+1;
  end loop;
 end loop;
 return jsonb_build_object('allocated',changed,'createdMovements',0);
end $$;
revoke all on function public.sync_mp_reserve_ledger(text) from public,anon,authenticated,service_role;
-- Both arrivals (main account or reserve) retry association once evidence exists.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.capture_mp_reserve_web(text,uuid,jsonb)'::regprocedure);
 if position('perform sync_mp_reserve_ledger(p_mp);' in definition)=0 then definition:=replace(definition,'return jsonb_build_object(''captured'',n,','perform sync_mp_reserve_ledger(p_mp);return jsonb_build_object(''captured'',n,');execute definition;end if;
 definition:=pg_get_functiondef('public.sync_mp_bank_inbox(text,uuid)'::regprocedure);
 if position('perform sync_mp_reserve_ledger(p_mp);' in definition)=0 then definition:=replace(definition,'return result||jsonb_build_object','perform sync_mp_reserve_ledger(p_mp);return result||jsonb_build_object');execute definition;end if;
end $$;
notify pgrst,'reload schema';
commit;
