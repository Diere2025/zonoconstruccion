begin;
-- Evaluate canonical Activity once per reconciliation instead of once per
-- bank row/subquery. Keep matching predicates, permissions and ledger writes intact.
do $$
declare definition text;tail_definition text;split_at integer;
begin
 definition:=pg_get_functiondef('public.reconcile_mp_bank_web(text)'::regprocedure);
 if position('activity_cache mp_bank_activity_rows[]' in definition)=0 then
  if position('canonical_mp_bank_activity(p_mp)' in definition)=0 then raise exception 'Unexpected reconciliation definition';end if;
  definition:=replace(definition,'declare r mp_bank_web_rows;','declare activity_cache mp_bank_activity_rows[];r mp_bank_web_rows;');
  definition:=replace(definition,'canonical_mp_bank_activity(p_mp)','unnest(activity_cache)');
  definition:=replace(definition,'for r in select * from mp_bank_web_rows','activity_cache:=array(select a from canonical_mp_bank_activity(p_mp) a);' || chr(10) || ' for r in select * from mp_bank_web_rows');
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.enrich_mp_bank_reference_metadata(text)'::regprocedure);
 if position('activity_cache mp_bank_activity_rows[]' in definition)=0 then
  split_at:=position('for w in select * from mp_bank_web_rows' in definition);
  if split_at=0 then raise exception 'Unexpected Activity enrichment definition';end if;
  tail_definition:=replace(substr(definition,split_at),'canonical_mp_bank_activity(p_mp)','unnest(activity_cache)');
  definition:=substr(definition,1,split_at-1)||'activity_cache:=array(select a from canonical_mp_bank_activity(p_mp) a);'||chr(10)||tail_definition;
  definition:=replace(definition,'declare activity_record mp_bank_activity_rows;','declare activity_cache mp_bank_activity_rows[];activity_record mp_bank_activity_rows;');
  execute definition;
 end if;
 -- The public capture wrapper calls sync_mp_bank_inbox immediately after this
 -- parser; sync reconciles under the same lock. Avoid doing it twice.
 definition:=pg_get_functiondef('public.capture_mp_bank_web_before_inbox(text,jsonb)'::regprocedure);
 if position('perform reconcile_mp_bank_web(p_mp);' in definition)>0 then
  definition:=replace(definition,'perform reconcile_mp_bank_web(p_mp);','-- Reconciliation runs once in the public capture wrapper through inbox sync.');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
