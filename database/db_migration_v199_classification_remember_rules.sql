begin;
create or replace function public.movement_bank_rule_reference(p_transaction uuid) returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare w mp_bank_web_rows;candidate text;key text;
begin
 select b.* into w from mp_bank_web_rows b join bank_entry_ledger_links l on l.entry_id=coalesce(b.statement_entry_id,b.prepared_entry_id) where l.cash_transaction_id=p_transaction order by b.id limit 1;
 if not found or w.operation_kind='reserve_transfer' then return null;end if;
 foreach candidate in array array[w.counterparty_name,w.activity_type,w.description] loop
 key:=bank_reference_key(candidate);
 if length(key) between 3 and 1000 and key !~ '^reserva( |$)' and key not in ('pago','retiro de dinero','movimiento general','movimiento desconocido','ingreso de dinero','dinero recibido','cobro','transferencia','transferencia de dinero','transferencia enviada','transferencia recibida','actividad pendiente','actividad por completar') then return trim(candidate);end if;
 end loop;
 return null;
end $$;
create or replace function public.unclassified_financial_movements_with_rules(p_actor uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows jsonb;
begin rows:=unclassified_financial_movements(p_actor);return (select coalesce(jsonb_agg(value||jsonb_build_object('rule_reference',movement_bank_rule_reference((value->>'id')::uuid)) order by ord),'[]'::jsonb) from jsonb_array_elements(rows) with ordinality as x(value,ord));end $$;
create or replace function public.classify_and_remember_financial_movement(p_actor uuid,p_transaction uuid,p_concept uuid,p_version integer,p_remember boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare reference text;reference_key text;direction_key text;previous bank_classification_rules;options uuid[];rid uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 if coalesce(p_remember,false) then
 reference:=movement_bank_rule_reference(p_transaction);if reference is null then raise exception 'Esta descripción es genérica o no tiene referencia bancaria. Clasificá sin recordar la asociación.';end if;
 reference_key:=bank_reference_key(reference);select type into strict direction_key from cash_transactions where id=p_transaction;
 if exists(select 1 from bank_classification_rules where is_active and financial_account_id is not null and description=reference_key and direction=direction_key and (financial_concept_id<>p_concept or cardinality(alternative_concept_ids)>0)) then raise exception 'Esta referencia tiene una asociación por caja. Revisala en Asociaciones automáticas o clasificá sin recordar.';end if;
 select * into previous from bank_classification_rules where financial_account_id is null and description=reference_key and direction=direction_key and is_active for update;
 if previous.association_group='binance_p2p' and previous.financial_concept_id<>p_concept then raise exception 'Esta referencia está asociada a Binance P2P. Revisala en Asociaciones automáticas o clasificá sin recordar.';end if;
 options:=array[p_concept];if previous.id is not null then select array_agg(distinct id order by id) into options from unnest(array[previous.financial_concept_id]||coalesce(previous.alternative_concept_ids,'{}'::uuid[])||array[p_concept]) id;end if;
 end if;
 perform classify_catalog_financial_movement(p_actor,p_transaction,p_concept,p_version);
 if coalesce(p_remember,false) then
 rid:=save_bank_rule_options(p_actor,reference_key,direction_key,options,previous.version,coalesce(previous.association_group,'common'),coalesce(previous.display_name,reference),coalesce(previous.merchant_alias,''));
 end if;
 return jsonb_build_object('saved',true,'rule_saved',coalesce(p_remember,false),'rule_id',rid,'reference',reference,'automatic',coalesce(p_remember,false) and cardinality(options)=1);
end $$;
revoke all on function movement_bank_rule_reference(uuid),unclassified_financial_movements_with_rules(uuid),classify_and_remember_financial_movement(uuid,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function unclassified_financial_movements_with_rules(uuid),classify_and_remember_financial_movement(uuid,uuid,uuid,integer,boolean) to service_role;
notify pgrst,'reload schema';
commit;
