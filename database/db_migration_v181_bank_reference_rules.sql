begin;
-- Name/Activity rules reuse the audited account-and-direction rule registry.
create or replace function public.bank_reference_key(p_text text) returns text
language sql immutable as $$select regexp_replace(translate(lower(trim(coalesce(p_text,''))),'áéíóúüñ','aeiouun'),'[[:space:]]+',' ','g')$$;
create or replace function public.mark_mp_bank_reserve_pairs(p_mp text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update mp_bank_web_rows w set operation_kind='reserve_transfer'
 where w.mp_account_id=p_mp and w.operation_kind is distinct from 'reserve_transfer' and exists (
 select 1 from mp_bank_web_rows x where x.mp_account_id=w.mp_account_id and x.operation_id=w.operation_id
 group by x.operation_id having count(*)=2 and sum(x.amount)=0 and min(x.amount)<0 and max(x.amount)>0
 and min(date_trunc('minute',x.occurred_at))=max(date_trunc('minute',x.occurred_at))
 and bool_or(bank_reference_key(x.counterparty_name) ~ '^reserva( |$)'));
 update mp_bank_web_rows w set proposed_concept_id=(select min(id::text)::uuid from financial_concepts where is_active and concept='Movimiento de cuentas' and category='Movimiento de cuentas' having count(*)=1)
 where w.mp_account_id=p_mp and w.operation_kind='reserve_transfer' and w.review_version=1 and w.proposed_concept_id is null and w.statement_entry_id is null
 and not exists(select 1 from bank_entry_ledger_links l where l.entry_id=w.prepared_entry_id)
 and (select count(*) from financial_concepts where is_active and concept='Movimiento de cuentas' and category='Movimiento de cuentas')=1;
$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.sync_mp_bank_inbox(text,uuid)'::regprocedure);
 if position('perform mark_mp_bank_reserve_pairs' in definition)=0 then
  definition:=replace(definition,'perform enrich_mp_bank_reference_metadata(p_mp);','perform enrich_mp_bank_reference_metadata(p_mp); perform mark_mp_bank_reserve_pairs(p_mp);');
  definition:=replace(definition,'select e.id,e.description,e.signed_amount from bank_statement_entries','select e.id,e.description,e.signed_amount,w.counterparty_name,w.activity_type,w.operation_kind from bank_statement_entries');
  definition:=replace(definition,'description=description_key and direction=direction_key','description in (description_key,bank_reference_key(entry_record.counterparty_name),bank_reference_key(entry_record.activity_type)) and direction=direction_key');
  definition:=replace(definition,'when description_key=''movimiento de cuentas''','when entry_record.operation_kind=''reserve_transfer'' or description_key=''movimiento de cuentas''');
  if position('w.counterparty_name,w.activity_type,w.operation_kind' in definition)=0 or position('bank_reference_key(entry_record.counterparty_name)' in definition)=0 then raise exception 'Unexpected inbox function. Migration aborted.';end if;
  execute definition;
 end if;
end $$;
revoke all on function public.bank_reference_key(text),public.mark_mp_bank_reserve_pairs(text) from public,anon,authenticated;
grant execute on function public.bank_reference_key(text),public.mark_mp_bank_reserve_pairs(text) to service_role;
notify pgrst,'reload schema';
commit;
