begin;
create or replace function public.canonical_mp_bank_activity(p_mp text) returns setof public.mp_bank_activity_rows
language sql stable security definer set search_path=public,pg_temp as $$
 select a.* from mp_bank_activity_rows a where a.mp_account_id=p_mp and not (
 bank_reference_key(a.description)=bank_reference_key(a.name) and a.review_version=1 and a.proposed_concept_id is null
 and not exists(select 1 from mp_bank_activity_links l where l.activity_id=a.id)
 and (select count(*) from mp_bank_activity_rows b where b.mp_account_id=a.mp_account_id and b.occurred_at=a.occurred_at and b.amount=a.amount and bank_reference_key(b.name)=bank_reference_key(a.name))=2
 and exists(select 1 from mp_bank_activity_rows b where b.mp_account_id=a.mp_account_id and b.occurred_at=a.occurred_at and b.amount=a.amount and bank_reference_key(b.name)=bank_reference_key(a.name) and bank_reference_key(b.description)<>bank_reference_key(b.name) and (a.operation_id is null or b.operation_id is null or a.operation_id=b.operation_id))
 );
$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.reconcile_mp_bank_web(text)'::regprocedure);
 definition:=replace(definition,'from mp_bank_activity_rows a','from canonical_mp_bank_activity(p_mp) a');
 definition:=replace(definition,'a.mp_account_id=p_mp and a.amount=r.amount','a.mp_account_id=p_mp and (a.operation_id is null or a.operation_id=r.operation_id) and a.amount=r.amount');execute definition;
 definition:=pg_get_functiondef('public.enrich_mp_bank_reference_metadata(text)'::regprocedure);
 definition:=replace(definition,'from mp_bank_activity_rows where mp_account_id=p_mp and operation_id is null','from canonical_mp_bank_activity(p_mp) where operation_id is null');
 definition:=replace(definition,'from mp_bank_activity_rows x','from canonical_mp_bank_activity(p_mp) x');
 definition:=replace(definition,'from mp_bank_activity_rows a','from canonical_mp_bank_activity(p_mp) a');
 definition:=replace(definition,'a.operation_id=w.operation_id and date_trunc(''minute'',a.occurred_at)=date_trunc(''minute'',w.occurred_at)','a.operation_id=w.operation_id and (a.occurred_at at time zone ''America/Argentina/Buenos_Aires'')::date=(w.occurred_at at time zone ''America/Argentina/Buenos_Aires'')::date');execute definition;
 definition:=pg_get_functiondef('public.sync_mp_bank_inbox(text,uuid)'::regprocedure);
 if position('perform reconcile_mp_bank_web(p_mp); perform mark_mp_bank_reserve_pairs(p_mp);' in definition)=0 then
 definition:=replace(definition,'perform reconcile_mp_bank_web(p_mp);','perform reconcile_mp_bank_web(p_mp); perform mark_mp_bank_reserve_pairs(p_mp);');execute definition;
 end if;
end $$;
revoke all on function public.canonical_mp_bank_activity(text) from public,anon,authenticated;
grant execute on function public.canonical_mp_bank_activity(text) to service_role;
notify pgrst,'reload schema';
commit;
