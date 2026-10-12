begin;
alter table public.bank_classification_rules add column if not exists association_group text not null default 'common' check (association_group in ('common','binance_p2p'));
alter table public.bank_classification_rules add column if not exists display_name text;
alter table public.bank_classification_rules add column if not exists merchant_alias text;
alter table public.bank_classification_rules add column if not exists evidence_files jsonb not null default '[]'::jsonb;
create or replace function public.save_bank_grouped_rule(p_actor uuid,p_description text,p_direction text,p_concept uuid,p_version integer,p_group text,p_name text,p_alias text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid; previous bank_classification_rules;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if p_group is null or p_group not in ('common','binance_p2p') or length(coalesce(p_name,''))>1000 or length(coalesce(p_alias,''))>200 then raise exception 'Asociación inválida.';end if;
 if p_group='binance_p2p' and (p_direction<>'egreso' or not exists(select 1 from financial_concepts where id=p_concept and is_active and concept='Binance - Carga de saldo' and category='Publicidad')) then raise exception 'Binance P2P corresponde a egresos de carga de saldo para Publicidad.';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into previous from bank_classification_rules where financial_account_id is null and description=p_description and direction=p_direction and is_active for update;
 rid:=save_bank_statement_rule(p_actor,null,p_description,p_direction,p_concept,p_version);
 update bank_classification_rules set association_group=p_group,display_name=nullif(trim(p_name),''),merchant_alias=nullif(trim(p_alias),'') where id=rid;
 insert into bank_statement_events(action,before_value,after_value,actor_id) values('rule.group',to_jsonb(previous),(select to_jsonb(r) from bank_classification_rules r where r.id=rid),p_actor);
 return rid;
end $$;
revoke all on function public.save_bank_grouped_rule(uuid,text,text,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.save_bank_grouped_rule(uuid,text,text,uuid,integer,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
