begin;
alter function get_supplier_cutover_review(uuid,uuid) rename to get_supplier_cutover_review_v258;
create function public.get_supplier_cutover_review(p_supplier uuid,p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;cut date;ars numeric:=0;usd numeric:=0;configured boolean;unused integer;
begin
 result:=get_supplier_cutover_review_v258(p_supplier,p_batch);cut:=(result->>'cutoffDate')::date;
 select count(*) into unused from supplier_import_rows where supplier_id=p_supplier and batch_id=p_batch and status<>'excluded' and (original_values->>2)~*'cuenta[[:space:]]*3';
 select exists(select 1 from supplier_account_starts where supplier_id=p_supplier and start_date<=cut) into configured;
 if configured then
  select s.opening_ars+coalesce(sum(e.amount) filter(where e.currency='ARS'),0),s.opening_usd+coalesce(sum(e.amount) filter(where e.currency='USD'),0) into ars,usd
  from supplier_account_starts s left join supplier_account_entries e on e.supplier_id=s.supplier_id and e.entry_date<=cut and not e.voided
   and coalesce((select h.included from supplier_account_history h where h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id),e.entry_date>=s.start_date)
  where s.supplier_id=p_supplier group by s.supplier_id,s.opening_ars,s.opening_usd;
 end if;
 return result||jsonb_build_object('ready',(result->>'ready')::boolean and unused=0,'unusedAccountRows',unused,'currentConfigured',configured,'currentArs',ars,'currentUsd',usd,
 'differenceArs',(result->>'openingArs')::numeric-ars,'differenceUsd',(result->>'openingUsd')::numeric-usd,
 'differenceEvidenceRequired',not configured or (result->>'openingArs')::numeric<>ars or (result->>'openingUsd')::numeric<>usd);
end $$;
do $patch$
declare definition text;anchor text:='day:=(report->>''cutoffDate'')::date;';
begin
 select pg_get_functiondef('apply_supplier_reviewed_cutover(uuid,uuid,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Revisar evidencia de diferencias antes del corte.';end if;
 execute replace(definition,anchor,$guard$
 if (report->>'differenceEvidenceRequired')::boolean and length(trim(coalesce(p_payload->>'differenceEvidence',''))) not between 20 and 2000 then
  raise exception 'Documentá el respaldo del saldo y la explicación de la diferencia antes de cambiar la apertura.';
 end if;
 $guard$||anchor);
end $patch$;
revoke all on function get_supplier_cutover_review_v258(uuid,uuid),get_supplier_cutover_review(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function get_supplier_cutover_review(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
