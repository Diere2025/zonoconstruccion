begin;
create table if not exists public.financial_movement_classification_events (
 id bigint generated always as identity primary key,transaction_id uuid not null references cash_transactions(id),
 before_value jsonb not null,after_value jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp()
);
alter table public.financial_movement_classification_events enable row level security;
revoke all on public.financial_movement_classification_events from public,anon,authenticated;
grant all on public.financial_movement_classification_events to service_role;
grant usage,select on sequence public.financial_movement_classification_events_id_seq to service_role;
create or replace function public.unclassified_financial_movements(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'code',t.movement_code,'occurred_at',t.created_at,'account_id',t.financial_account_id,'account',coalesce(a.name,'Sin cuenta'),'type',t.type,'amount',t.amount::text,'currency',coalesce(t.currency,'ARS'),'version',coalesce(o.version,0),'description',coalesce(w.description,t.notes,t.concept,''),'counterparty',w.counterparty_name,'operation_reference',w.operation_id,'suggested_concept_ids',coalesce((
 select jsonb_agg(distinct option_id::text) from bank_classification_rules b cross join lateral unnest(array[b.financial_concept_id]||b.alternative_concept_ids) option_id join financial_concepts c on c.id=option_id and c.is_active
 where b.is_active and b.direction=t.type and (b.financial_account_id=t.financial_account_id or b.financial_account_id is null)
 and b.description in (bank_reference_key(w.counterparty_name),bank_reference_key(w.activity_type),bank_reference_key(w.description))),'[]'::jsonb)) order by t.created_at desc,t.id),'[]'::jsonb) into result
 from cash_transactions t left join financial_accounts a on a.id=t.financial_account_id left join financial_operations o on o.id=t.operation_id
 left join lateral (select w.* from mp_bank_web_rows w join bank_entry_ledger_links l on l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) where l.cash_transaction_id=t.id order by w.id limit 1) w on true
 where (lower(trim(coalesce(t.category,'')))='sin clasificar' or lower(trim(coalesce(t.concept,''))) in ('','sin clasificar'))
 and t.reversal_of_transaction_id is null and coalesce(o.status,'posted')='posted' and not exists(select 1 from cash_transactions reversed where reversed.reversal_of_transaction_id=t.id);
 return result;
end $$;
create or replace function public.classify_existing_financial_movement(p_actor uuid,p_transaction uuid,p_concept uuid,p_version integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t cash_transactions;c financial_concepts;op financial_operations;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select o.* into op from financial_operations o join cash_transactions cash on cash.operation_id=o.id where cash.id=p_transaction for update of o;
 select * into strict t from cash_transactions where id=p_transaction for update;
 if coalesce(op.version,0) is distinct from p_version then raise exception 'El movimiento cambió. Actualizá la pantalla.' using errcode='40001';end if;
 if t.reversal_of_transaction_id is not null or coalesce(op.status,'posted')<>'posted' or exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id) then raise exception 'El movimiento está anulado.';end if;
 if not (lower(trim(coalesce(t.category,'')))='sin clasificar' or lower(trim(coalesce(t.concept,''))) in ('','sin clasificar')) then raise exception 'El movimiento ya está clasificado. Actualizá la pantalla.' using errcode='40001';end if;
 select * into strict c from financial_concepts where id=p_concept and is_active;
 if coalesce(length(trim(c.category)),0)=0 or coalesce(length(trim(c.concept)),0)=0 or length(c.concept)>240 or lower(trim(c.concept))='sin clasificar' or lower(trim(c.category))='sin clasificar' then raise exception 'Elegí un concepto válido.';end if;
 perform set_config('zono.financial_write','on',true);
 update cash_transactions set financial_concept_id=c.id,concept=c.concept,category=c.category,sub_category=nullif(c.sub_category,''),efe_category=nullif(c.efe_category,'') where id=t.id;
 if op.id is not null then
  update financial_operations set version=version+1,updated_at=clock_timestamp() where id=op.id;
  insert into financial_operation_events(operation_id,action,before_value,after_value,reason,actor_id) values(op.id,'movement.classify',jsonb_build_object('concept',t.financial_concept_id),jsonb_build_object('concept',c.id),'Clasificación de movimiento sin alterar el dinero',p_actor);
 end if;
 perform set_config('zono.financial_write','off',true);
 update bank_statement_entries e set financial_concept_id=c.id,version=version+1 from bank_entry_ledger_links l where l.entry_id=e.id and l.cash_transaction_id=t.id;
 update mp_bank_web_rows w set proposed_concept_id=c.id,review_version=review_version+1 where exists(select 1 from bank_entry_ledger_links l where l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) and l.cash_transaction_id=t.id);
 insert into financial_movement_classification_events(transaction_id,before_value,after_value,actor_id) values(t.id,jsonb_build_object('concept',t.financial_concept_id,'label',t.concept,'category',t.category),jsonb_build_object('concept',c.id,'label',c.concept,'category',c.category),p_actor);
end $$;
revoke all on function public.unclassified_financial_movements(uuid),public.classify_existing_financial_movement(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.unclassified_financial_movements(uuid),public.classify_existing_financial_movement(uuid,uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
