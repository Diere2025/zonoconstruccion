begin;
create or replace function public.deactivate_bank_classification_rule(p_actor uuid,p_rule uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous bank_classification_rules;updated bank_classification_rules;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if p_version is null or p_version<1 then raise exception 'Versión inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into previous from bank_classification_rules where id=p_rule for update;
 if not found then raise exception 'La asociación ya no existe. Actualizá la lista.' using errcode='40001';end if;
 -- A retry after a lost response is safe and does not duplicate the audit event.
 if not previous.is_active and previous.version=p_version+1 then return jsonb_build_object('saved',true,'already_inactive',true);end if;
 if previous.version is distinct from p_version or not previous.is_active then raise exception 'La asociación cambió. Actualizá la lista antes de desactivarla.' using errcode='40001';end if;
 update bank_classification_rules set is_active=false,version=version+1 where id=previous.id returning * into updated;
 insert into bank_statement_events(action,before_value,after_value,actor_id) values('rule.deactivate',to_jsonb(previous),to_jsonb(updated),p_actor);
 return jsonb_build_object('saved',true,'already_inactive',false);
end $$;
revoke all on function public.deactivate_bank_classification_rule(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.deactivate_bank_classification_rule(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
