begin;
-- Inclusive ±2 minutes; both sides must share one bank operation. Never match
-- on amount/time alone to an ordinary payment, or choose between candidates.
create or replace function public.mp_reserve_transfer_candidates(p_mp text)
returns table(reserve_row_id uuid,bank_capture_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 with pairs as (
  select r.id reserve_row_id,w.id bank_capture_id,w.operation_id
  from mp_reserve_web_rows r
  join mp_reserve_accounts cfg on cfg.mp_account_id=r.mp_account_id and cfg.reserve_id=r.reserve_id and cfg.enabled
  join mp_bank_web_rows w on w.mp_account_id=r.mp_account_id and w.amount=r.amount
   and w.occurred_at between r.occurred_at-interval '2 minutes' and r.occurred_at+interval '2 minutes'
  where r.mp_account_id=p_mp and r.kind in ('deposit','withdrawal')
   and (r.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date>=cfg.history_from
   and (select count(*)=2 and sum(x.amount)=0 and min(x.occurred_at)=max(x.occurred_at)
    from mp_bank_web_rows x where x.mp_account_id=w.mp_account_id and x.operation_id=w.operation_id)
 ), unique_pairs as (
  select *,count(*) over(partition by reserve_row_id) reserve_matches,
   count(*) over(partition by operation_id) operation_matches from pairs
 ) select reserve_row_id,bank_capture_id from unique_pairs where reserve_matches=1 and operation_matches=1;
$$;
revoke all on function public.mp_reserve_transfer_candidates(text) from public,anon,authenticated,service_role;
create or replace function public.mark_mp_bank_reserve_pairs(p_mp text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update mp_bank_web_rows w set operation_kind='reserve_transfer'
 where w.mp_account_id=p_mp and w.operation_kind is distinct from 'reserve_transfer' and exists (
 select 1 from mp_bank_web_rows x where x.mp_account_id=w.mp_account_id and x.operation_id=w.operation_id
 group by x.operation_id having count(*)=2 and sum(x.amount)=0 and min(x.amount)<0 and max(x.amount)>0
 and min(date_trunc('minute',x.occurred_at))=max(date_trunc('minute',x.occurred_at))
 and bool_or(bank_reference_key(x.counterparty_name) ~ '^reserva( |$)'));
 -- A captured reserve event independently proves the pair, even when Activity
 -- labels or clocks differ. Mutual uniqueness prevents choosing a nearest match.
 update mp_bank_web_rows w set operation_kind='reserve_transfer'
 where w.mp_account_id=p_mp and w.operation_kind is distinct from 'reserve_transfer'
 and exists(select 1 from mp_reserve_transfer_candidates(p_mp) candidate
  join mp_bank_web_rows matched on matched.id=candidate.bank_capture_id
  where matched.operation_id=w.operation_id);
 update mp_bank_web_rows w set proposed_concept_id=(select min(id::text)::uuid from financial_concepts where is_active and concept='Movimiento de cuentas' and category='Movimiento de cuentas' having count(*)=1)
 where w.mp_account_id=p_mp and w.operation_kind='reserve_transfer' and w.review_version=1 and w.proposed_concept_id is null and w.statement_entry_id is null
 and not exists(select 1 from bank_entry_ledger_links l where l.entry_id=w.prepared_entry_id)
 and (select count(*) from financial_concepts where is_active and concept='Movimiento de cuentas' and category='Movimiento de cuentas')=1;
$$;
create or replace function public.sync_mp_reserve_ledger(p_mp text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg mp_reserve_accounts;r mp_reserve_web_rows;t cash_transactions;c financial_concepts;n integer;bid uuid;tx uuid;peer uuid;op uuid;changed integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 perform mark_mp_bank_reserve_pairs(p_mp);
 for cfg in select * from mp_reserve_accounts where mp_account_id=p_mp and enabled loop
  if not can_manage_financial_operations(cfg.actor_id) or not exists(select 1 from financial_accounts where id=cfg.reserve_account_id and is_active and currency='ARS' and type in ('virtual','banco')) then raise exception 'Caja de reserva no disponible';end if;
  for r in select w.* from mp_reserve_web_rows w where w.mp_account_id=p_mp and w.reserve_id=cfg.reserve_id and (w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date>=cfg.history_from and not exists(select 1 from mp_reserve_ledger_links l where l.reserve_row_id=w.id) order by w.occurred_at,w.id for update loop
   tx:=null;bid:=null;peer:=null;
   -- Repeated indistinguishable reserve events require review, never guessing.
   if (select count(*) from mp_reserve_web_rows x where x.mp_account_id=p_mp and x.reserve_id=r.reserve_id and x.kind=r.kind and x.amount=r.amount and x.occurred_at=r.occurred_at)<>1 then continue;end if;
   select count(*),min(w.id::text)::uuid into n,bid from mp_bank_web_rows w where w.mp_account_id=p_mp and w.amount=r.amount
    and (case when r.kind='yield' then w.occurred_at=r.occurred_at and w.description ~* 'rendimiento|intereses'
     else exists(select 1 from mp_reserve_transfer_candidates(p_mp) candidate where candidate.reserve_row_id=r.id and candidate.bank_capture_id=w.id) end);
   if n=1 then
    select l.cash_transaction_id into tx from mp_bank_web_rows w join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) where w.id=bid;
    if r.kind<>'yield' then
     select count(*),min(l.cash_transaction_id::text)::uuid into n,peer from mp_bank_web_rows w join mp_bank_web_rows matched on matched.id=bid join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id)
      where w.mp_account_id=p_mp and w.operation_id=matched.operation_id and w.operation_kind='reserve_transfer' and w.occurred_at=matched.occurred_at and w.amount=-r.amount;
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
notify pgrst,'reload schema';
commit;
