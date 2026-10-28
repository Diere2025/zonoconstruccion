begin;
-- Both signed bank components belong to the identified reserve transfer even
-- when Activity supplies a reference for only one side. Do not infer a person
-- or change its financial classification from this display fallback.
do $$
declare definition text;description_sql text;
begin
 definition:=pg_get_functiondef('public.unclassified_financial_movements(uuid)'::regprocedure);
 description_sql:='coalesce(nullif(trim(w.activity_type),''''),nullif(trim(w.description),''''),t.notes,t.concept,'''')';
 if position('case when w.operation_kind=''reserve_transfer''' in definition)=0 then
  if position(description_sql in definition)=0 then raise exception 'Expected v230 movement description';end if;
  definition:=replace(definition,description_sql,'case when w.operation_kind=''reserve_transfer'' then ''Movimiento de cuentas'' else '||description_sql||' end');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
