begin;
create function public.supplier_cutover_unassigned_count(p_supplier uuid,p_batch uuid) returns integer
language sql stable security definer set search_path=public,pg_temp as $$
select count(*)::integer from supplier_import_rows r join supplier_import_batches b on b.id=r.batch_id
join supplier_source_aliases a on a.source_book=b.source_book and a.source_alias=r.original_values->>2 and a.status='verified'
where r.batch_id=p_batch and a.supplier_id=p_supplier and r.supplier_id is distinct from p_supplier and r.status<>'excluded'
$$;
do $patch$
declare definition text;anchor text;
begin
 select pg_get_functiondef('get_supplier_cutover_review(uuid,uuid)'::regprocedure) into definition;
 anchor:='''ready'',(result->>''ready'')::boolean and unused=0';if position(anchor in definition)=0 then raise exception 'Revisar cobertura de origen antes de aplicar el corte.';end if;
 definition:=replace(definition,anchor,anchor||' and supplier_cutover_unassigned_count(p_supplier,p_batch)=0');
 execute replace(definition,'''unusedAccountRows'',unused','''unassignedRows'',supplier_cutover_unassigned_count(p_supplier,p_batch),''unusedAccountRows'',unused');
 select pg_get_functiondef('apply_supplier_reviewed_cutover(uuid,uuid,jsonb)'::regprocedure) into definition;
 anchor:='perform 1 from supplier_import_rows where supplier_id=supplier and batch_id=batch order by id for update;';if position(anchor in definition)=0 then raise exception 'Revisar bloqueo del lote fuente.';end if;
 execute replace(definition,anchor,'perform 1 from supplier_import_rows where batch_id=batch order by id for update;');
end $patch$;
revoke all on function supplier_cutover_unassigned_count(uuid,uuid) from public,anon,authenticated;
grant execute on function supplier_cutover_unassigned_count(uuid,uuid) to service_role;
commit;
