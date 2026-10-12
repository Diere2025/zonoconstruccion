begin;
alter table public.bank_classification_rules add column if not exists alternative_concept_ids uuid[] not null default '{}';
create or replace function public.save_bank_rule_options(p_actor uuid,p_description text,p_direction text,p_concepts uuid[],p_version integer,p_group text,p_name text,p_alias text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid; n integer;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if coalesce(array_length(p_concepts,1),0) not between 1 and 20 or array_position(p_concepts,null) is not null then raise exception 'Seleccioná entre 1 y 20 conceptos.';end if;
 select count(distinct id) into n from financial_concepts where id=any(p_concepts) and is_active;
 if n<>array_length(p_concepts,1) then raise exception 'Conceptos inválidos o repetidos.';end if;
 if p_group='binance_p2p' and n<>1 then raise exception 'Binance P2P tiene un único concepto.';end if;
 rid:=save_bank_grouped_rule(p_actor,p_description,p_direction,p_concepts[1],p_version,p_group,p_name,p_alias);
 update bank_classification_rules set alternative_concept_ids=p_concepts[2:array_length(p_concepts,1)] where id=rid;
 insert into bank_statement_events(action,after_value,actor_id) values('rule.options',jsonb_build_object('rule_id',rid,'concept_ids',p_concepts),p_actor);
 return rid;
end $$;
-- Both SQL capture classification and client suggestions must see all alternatives.
do $$declare d text;signature regprocedure;begin
 signature:=coalesce(to_regprocedure('public.sync_mp_bank_inbox_before_v189(text,uuid)'),to_regprocedure('public.sync_mp_bank_inbox(text,uuid)'));
 d:=pg_get_functiondef(signature);
 if position('unnest(array[financial_concept_id]' in d)=0 then
  d:=replace(d,'select count(distinct financial_concept_id),min(financial_concept_id::text)::uuid','select count(distinct option_id),min(option_id::text)::uuid');
  d:=replace(d,'from bank_classification_rules where is_active','from bank_classification_rules cross join lateral unnest(array[financial_concept_id]||alternative_concept_ids) option_id where is_active');
  if position('unnest(array[financial_concept_id]' in d)=0 then raise exception 'Unexpected classification function';end if;
  execute d;
 end if;
end $$;
revoke all on function public.save_bank_rule_options(uuid,text,text,uuid[],integer,text,text,text) from public,anon,authenticated;
grant execute on function public.save_bank_rule_options(uuid,text,text,uuid[],integer,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
