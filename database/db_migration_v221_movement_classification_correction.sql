begin;
create index if not exists movement_classification_history_idx on public.financial_movement_classification_events(transaction_id,id desc);

create or replace function public.read_movement_classification(p_actor uuid,p_transaction uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t cash_transactions;result jsonb;
begin
 if not can_manage_treasury_settlements(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select * into strict t from cash_transactions where id=p_transaction;
 select jsonb_build_object(
  'id',t.id,'code',t.movement_code,'occurred_at',t.created_at,'amount',t.amount::text,'currency',coalesce(t.currency,'ARS'),'type',t.type,
  'account',(select name from financial_accounts where id=t.financial_account_id),'concept_id',t.financial_concept_id,'concept',t.concept,'category',t.category,'notes',t.notes,
  'classification',(select value from financial_classification_snapshots where transaction_id=t.id),
  'token',md5(to_jsonb(t)::text||coalesce((select max(id)::text from financial_movement_classification_events where transaction_id=t.id),'')),
  'editable',can_manage_financial_operations(p_actor) and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions where reversal_of_transaction_id=t.id) and coalesce((select status from financial_operations where id=t.operation_id),'posted')='posted',
  'rules',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'description',r.description,'display_name',r.display_name,'association_group',r.association_group,'financial_account_id',r.financial_account_id)) from bank_classification_rules r
   where r.is_active and r.direction=t.type and (r.financial_account_id is null or r.financial_account_id=t.financial_account_id) and exists(
    select 1 from bank_entry_ledger_links l join bank_statement_entries e on e.id=l.entry_id left join mp_bank_web_rows w on coalesce(w.statement_entry_id,w.prepared_entry_id)=e.id
    where l.cash_transaction_id=t.id and r.description in (bank_reference_key(w.counterparty_name),bank_reference_key(w.activity_type),bank_reference_key(w.description),bank_reference_key(e.description)))),'[]'::jsonb),
  'bank',coalesce((select jsonb_agg(jsonb_build_object('description',e.description,'reference',e.external_movement_id,'related_reference',e.related_operation_id,'occurred_at',e.occurred_at,
   'captures',coalesce((select jsonb_agg(jsonb_build_object('description',w.description,'counterparty',w.counterparty_name,'reference',w.operation_id,'payment_id',w.payment_id)) from mp_bank_web_rows w where coalesce(w.statement_entry_id,w.prepared_entry_id)=e.id),'[]'::jsonb)))
   from bank_entry_ledger_links l join bank_statement_entries e on e.id=l.entry_id where l.cash_transaction_id=t.id),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'before',h.before_value,'after',h.after_value,'at',h.created_at) order by h.id desc) from financial_movement_classification_events h where h.transaction_id=t.id),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.correct_movement_classification(p_actor uuid,p_transaction uuid,p_concept uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t cash_transactions;op financial_operations;c financial_concepts;before_value jsonb;after_value jsonb;current_value jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select o.* into op from financial_operations o join cash_transactions cash on cash.operation_id=o.id where cash.id=p_transaction for update of o;
 select * into strict t from cash_transactions where id=p_transaction for update;
 current_value:=read_movement_classification(p_actor,p_transaction);
 if current_value->>'token' is distinct from p_token then raise exception 'El movimiento cambió. Cerrá y volvé a abrir el detalle.' using errcode='40001';end if;
 if not (current_value->>'editable')::boolean then raise exception 'El movimiento está anulado.';end if;
 before_value:=jsonb_build_object('concept',t.financial_concept_id,'label',t.concept,'category',t.category,'sub_category',t.sub_category,'efe_category',t.efe_category,'classification',current_value->'classification');
 if p_concept is not null then
  select * into strict c from financial_concepts where id=p_concept and is_active;
  if trim(coalesce(c.category,''))='' or trim(coalesce(c.concept,''))='' or length(c.concept)>240 or lower(trim(c.concept))='sin clasificar' or lower(trim(c.category))='sin clasificar' then raise exception 'Elegí un concepto válido.';end if;
  if c.movement_type not in ('Mov. Financiero',case when t.type='ingreso' then 'Ingreso' else 'Egreso' end) then raise exception 'El tipo de la opción no corresponde al movimiento.';end if;
 end if;
 perform set_config('zono.financial_write','on',true);
 update cash_transactions set financial_concept_id=p_concept,concept=coalesce(c.concept,'Sin clasificar'),category=coalesce(c.category,'Sin clasificar'),sub_category=nullif(c.sub_category,''),efe_category=nullif(c.efe_category,'') where id=t.id;
 perform set_config('zono.financial_write','off',true);
 delete from financial_classification_snapshots where transaction_id=t.id;
 if p_concept is not null then perform apply_catalog_classification(p_actor,t.id,p_concept);end if;
 if op.id is not null then update financial_operations set version=version+1,updated_at=clock_timestamp() where id=op.id;end if;
 update bank_statement_entries e set financial_concept_id=p_concept,version=version+1 from bank_entry_ledger_links l where l.entry_id=e.id and l.cash_transaction_id=t.id;
 update mp_bank_web_rows w set proposed_concept_id=p_concept,review_version=review_version+1 where exists(select 1 from bank_entry_ledger_links l where l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id) and l.cash_transaction_id=t.id);
 select jsonb_build_object('concept',cash.financial_concept_id,'label',cash.concept,'category',cash.category,'sub_category',cash.sub_category,'efe_category',cash.efe_category,'classification',(select value from financial_classification_snapshots where transaction_id=t.id)) into after_value from cash_transactions cash where cash.id=t.id;
 insert into financial_movement_classification_events(transaction_id,before_value,after_value,actor_id) values(t.id,before_value,after_value,p_actor);
 if op.id is not null then insert into financial_operation_events(operation_id,action,before_value,after_value,reason,actor_id) values(op.id,'movement.classify',before_value,after_value,'Corrección de clasificación sin alterar el dinero',p_actor);end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.read_movement_classification(uuid,uuid),public.correct_movement_classification(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_movement_classification(uuid,uuid),public.correct_movement_classification(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
