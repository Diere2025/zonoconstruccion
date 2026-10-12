-- Pending inbox starts on 30/09/2026. No ledger writes or cutover changes.
begin;
do $migration$
declare signature text; definition text;
begin
 foreach signature in array array['public.create_bank_statement_from_web(uuid,uuid,jsonb)','public.sync_mp_bank_inbox(text,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('2026-10-01T00:00:00-03:00' in definition)>0 then
   execute replace(definition,'2026-10-01T00:00:00-03:00','2026-09-30T00:00:00-03:00');
  elsif position('2026-09-30T00:00:00-03:00' in definition)=0 then raise exception 'Unexpected cutoff in %',signature;
  end if;
 end loop;
end $migration$;
create or replace function public.bank_inbox_pending_before(p_account uuid,p_from date)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('count',count(*),'from',min((w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date),'to',max((w.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date))
 from mp_bank_web_rows w join bank_statement_mp_accounts m on m.mp_account_id=w.mp_account_id
 where m.financial_account_id=p_account and w.occurred_at>='2026-09-30T00:00:00-03:00'::timestamptz
 and w.occurred_at<(p_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and not exists(select 1 from bank_entry_ledger_links l where l.entry_id=coalesce(w.statement_entry_id,w.prepared_entry_id));
$$;
revoke all on function public.bank_inbox_pending_before(uuid,date) from public,anon,authenticated;
grant execute on function public.bank_inbox_pending_before(uuid,date) to service_role;
commit;
