begin;
-- Reuse the audited registry and its existing unique index for NULL (all accounts).
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.save_bank_statement_rule(uuid,uuid,text,text,uuid,integer)'::regprocedure);
 if position('financial_account_id is not distinct from p_account' in definition)=0 then
  definition:=replace(definition,'perform 1 from financial_accounts where id=p_account and is_active for update;if not found then raise exception ''Cuenta no disponible.'';end if;','if p_account is not null then perform 1 from financial_accounts where id=p_account and is_active for update;if not found then raise exception ''Cuenta no disponible.'';end if;end if; perform pg_advisory_xact_lock(hashtextextended(''bank_statement_commit'',0));');
  definition:=replace(definition,'where financial_account_id=p_account and description=p_description','where financial_account_id is not distinct from p_account and description=p_description');
  if position('if p_account is not null then' in definition)=0 or position('financial_account_id is not distinct from p_account' in definition)=0 then raise exception 'Unexpected rule function. Migration aborted.';end if;
  execute definition;
 end if;
end $$;
revoke all on function public.save_bank_statement_rule(uuid,uuid,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_bank_statement_rule(uuid,uuid,text,text,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
