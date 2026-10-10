-- Expand reference capture for all accounts from September 30 inclusive. Financial preparation/posting retains its October cutoff.
begin;
do $migration$
declare signature text; definition text; old_cutoff text; new_cutoff text;
begin
 foreach signature in array array['public.capture_mp_bank_web_before_inbox(text,jsonb)','public.capture_mp_bank_activity_before_inbox(text,jsonb)','public.request_mp_capture_refresh(text,text,uuid,boolean,date,date)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  old_cutoff:='''2026-10-01''';
  new_cutoff:='''2026-09-30''';
  if position(new_cutoff in definition)=0 then
   if position(old_cutoff in definition)=0 then raise exception 'Unexpected capture function: %',signature;end if;
   execute replace(definition,old_cutoff,new_cutoff);
  end if;
 end loop;
end $migration$;
do $migration$
declare constraint_name text;
begin
 for constraint_name in select conname from pg_constraint where conrelid='public.mp_capture_refresh_requests'::regclass and contype='c' and pg_get_constraintdef(oid) like '%date_from%' loop
  execute format('alter table public.mp_capture_refresh_requests drop constraint %I',constraint_name);
 end loop;
 alter table public.mp_capture_refresh_requests add constraint mp_capture_refresh_reference_dates check(date_from>='2026-09-30' and date_to>=date_from and date_to-date_from<=31);
end $migration$;
commit;
