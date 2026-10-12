begin;
-- Review follows classification for bank movements. No monetary fields change.
create or replace function public.bank_review_follows_classification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare classified boolean;
begin
 if new.bank_review_status is null and not exists(select 1 from bank_entry_ledger_links where cash_transaction_id=new.id) then return new;end if;
 classified:=new.financial_concept_id is not null and exists(select 1 from financial_concepts c where c.id=new.financial_concept_id and c.is_active)
  and coalesce(length(trim(new.concept)),0)>0 and coalesce(length(trim(new.category)),0)>0
  and lower(trim(new.concept))<>'sin clasificar' and lower(trim(new.category))<>'sin clasificar';
 if classified then
  new.bank_review_status:='reviewed';new.bank_reviewed_at:=coalesce(new.bank_reviewed_at,clock_timestamp());new.bank_reviewed_by:=coalesce(new.bank_reviewed_by,new.created_by);
 else
  new.bank_review_status:='pending';new.bank_reviewed_at:=null;new.bank_reviewed_by:=null;
 end if;
 return new;
end $$;
drop trigger if exists bank_review_follows_classification on public.cash_transactions;
create trigger bank_review_follows_classification before insert or update of financial_concept_id,concept,category,bank_review_status on public.cash_transactions
for each row execute function public.bank_review_follows_classification();
-- Preserve the current versions of posting and review, including later fixes.
do $$declare d text;begin
 d:=pg_get_functiondef('public.auto_post_bank_inbox(text)'::regprocedure);
 if position('review_status' in d)=0 then raise exception 'Unexpected automatic posting definition';end if;
 d:=replace(d,'jsonb_build_object(''transaction_id'',tx,''review_status'',''pending'')','jsonb_build_object(''transaction_id'',tx,''review_status'',(select bank_review_status from cash_transactions where id=tx))');
 execute d;
 d:=pg_get_functiondef('public.review_bank_inbox_capture(uuid,uuid,integer)'::regprocedure);
 if position('Clasificá el movimiento primero' in d)=0 then
  d:=replace(d,'update cash_transactions set bank_review_status=',
   'if t.financial_concept_id is null or lower(trim(coalesce(t.concept,''''))) in ('''',''sin clasificar'') or lower(trim(coalesce(t.category,''''))) in ('''',''sin clasificar'') then raise exception ''Clasificá el movimiento primero; quedará revisado automáticamente.'';end if; update cash_transactions set bank_review_status=');
  if position('Clasificá el movimiento primero' in d)=0 then raise exception 'Unexpected review definition';end if;
  execute d;
 end if;
end $$;
-- Apply the policy to existing linked movements. Repeating this is safe.
do $$declare r record;actor uuid;old_status text;begin
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 for r in select t.* from cash_transactions t where exists(select 1 from bank_entry_ledger_links l where l.cash_transaction_id=t.id) or t.bank_review_status is not null order by t.id for update loop
  old_status:=r.bank_review_status;
  update cash_transactions set bank_review_status=coalesce(bank_review_status,'pending') where id=r.id and bank_review_status is distinct from (
   case when r.financial_concept_id is not null and exists(select 1 from financial_concepts c where c.id=r.financial_concept_id and c.is_active)
    and coalesce(length(trim(r.concept)),0)>0 and coalesce(length(trim(r.category)),0)>0 and lower(trim(r.concept))<>'sin clasificar' and lower(trim(r.category))<>'sin clasificar' then 'reviewed' else 'pending' end);
  if found then
   select bank_review_status,bank_reviewed_by into old_status,actor from cash_transactions where id=r.id;
   insert into bank_statement_events(entry_id,action,before_value,after_value,actor_id)
   select l.entry_id,'review.automatic',jsonb_build_object('status',r.bank_review_status),jsonb_build_object('status',old_status,'classificationPolicy',true),coalesce(actor,r.created_by,l.created_by) from bank_entry_ledger_links l where l.cash_transaction_id=r.id;
  end if;
 end loop;
end $$;
revoke all on function public.bank_review_follows_classification() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
