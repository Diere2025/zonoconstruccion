begin;
-- v192 cached only the second loop. The first loop still evaluated the full
-- canonical catalog for every reference without an operation id (twice).
do $$
declare definition text;split_at integer;head text;
begin
 definition:=pg_get_functiondef('public.enrich_mp_bank_reference_metadata(text)'::regprocedure);
 if position('activity_cache:=array(select a from canonical_mp_bank_activity(p_mp) a);' in definition)=0 then raise exception 'Expected v192 Activity cache';end if;
 split_at:=position('activity_cache:=array(select a from canonical_mp_bank_activity(p_mp) a);' in definition);
 head:=substr(definition,1,split_at-1);
 if position('from canonical_mp_bank_activity(p_mp)' in head)>0 then
  head:=replace(head,'from canonical_mp_bank_activity(p_mp)','from unnest(activity_cache)');
  head:=replace(head,'begin','begin'||chr(10)||' activity_cache:=array(select a from canonical_mp_bank_activity(p_mp) a);');
  execute head||substr(definition,split_at);
 end if;
 -- Activity capture has the same duplicate reconciliation removed for banking
 -- in v192. The outer wrapper reconciles after storing operation ids.
 definition:=pg_get_functiondef('public.capture_mp_bank_activity_before_inbox(text,jsonb)'::regprocedure);
 definition:=replace(definition,'perform reconcile_mp_bank_web(p_mp);','/* Reconciled once by sync_mp_bank_inbox after operation ids are stored. */');
 execute definition;
 definition:=pg_get_functiondef('public.unclassified_financial_movements(uuid)'::regprocedure);
 if position('coalesce(w.description,t.notes,t.concept,'''')' in definition)=0 and position('coalesce(nullif(trim(w.activity_type)' in definition)=0 then raise exception 'Unexpected movement description';end if;
 definition:=replace(definition,'coalesce(w.description,t.notes,t.concept,'''')',
 'coalesce(nullif(trim(w.activity_type),''''),nullif(trim(w.description),''''),t.notes,t.concept,'''')');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
