begin;
-- automatic_from records enablement; source direct_from controls eligible dates.
-- Late captures within that source window must post just like current captures.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.auto_post_bank_inbox(text)'::regprocedure);
 if position('w.occurred_at>=since' in definition)>0 then
  definition:=replace(definition,'w.occurred_at>=since','w.occurred_at>=''2026-09-30T00:00:00-03:00''::timestamptz');
  execute definition;
 elsif position('w.occurred_at>=''2026-09-30T00:00:00-03:00''::timestamptz' in definition)=0 then raise exception 'Unexpected automatic posting date predicate';end if;
 definition:=pg_get_functiondef('public.capture_mp_bank_activity(text,jsonb)'::regprocedure);
 if position('occurred_at>=since' in definition)>0 then
  definition:=replace(definition,'occurred_at>=since','occurred_at>=''2026-09-30T00:00:00-03:00''::timestamptz');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
