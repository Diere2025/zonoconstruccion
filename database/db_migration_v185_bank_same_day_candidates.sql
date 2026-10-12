-- Same-account amount matches must share the Buenos Aires calendar day.
-- Changes matching functions only; existing money and links remain unchanged.
begin;
do $migration$
declare definition text; commit_signature regprocedure;
begin
 definition:=pg_get_functiondef('public.bank_statement_candidates(uuid,boolean)'::regprocedure);
 if position('between e.effective_date-3 and e.effective_date+3' in definition)>0 then
  execute replace(definition,'between e.effective_date-3 and e.effective_date+3','= e.effective_date');
 elsif position('= e.effective_date' in definition)=0 then raise exception 'Unexpected candidate date predicate';end if;
 commit_signature:=coalesce(to_regprocedure('public.commit_bank_statement_before_v170(uuid,uuid,uuid,integer,jsonb)'),to_regprocedure('public.commit_bank_statement(uuid,uuid,uuid,integer,jsonb)'));
 definition:=pg_get_functiondef(commit_signature);
 if position('not between e.effective_date-3 and e.effective_date+3' in definition)>0 then
  execute replace(definition,'not between e.effective_date-3 and e.effective_date+3','<> e.effective_date');
 elsif position('<> e.effective_date' in definition)=0 then raise exception 'Unexpected link date predicate';end if;
end $migration$;
commit;
