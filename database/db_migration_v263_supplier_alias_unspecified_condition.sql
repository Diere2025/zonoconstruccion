-- Identity and documentary classification are independent. Unlabelled accounts stay unclassified.
begin;
do $patch$
declare definition text;anchor text:='coalesce(p_payload->>''condition'','''') not in (''facturado'',''por_remito'',''historico'')';
begin
 select pg_get_functiondef('review_supplier_alias(uuid,uuid,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Revisar clasificación opcional de equivalencias.';end if;
 execute replace(definition,anchor,'(p_payload->>''condition'' is not null and p_payload->>''condition'' not in (''facturado'',''por_remito'',''historico''))');
end $patch$;
commit;
