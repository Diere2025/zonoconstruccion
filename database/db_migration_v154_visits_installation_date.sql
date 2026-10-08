alter table public.visit_cases add column if not exists installation_date date;
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 if position('-- v154 installation date' in definition)=0 then
  definition:=replace(definition,' -- v153 coordination',$patch$
 -- v154 installation date
 if p_command='outcome' and p_data->>'outcome'='won' then
  update public.visit_cases set installation_date=nullif(p_data->>'installation_date','')::date where id=p_case;
 end if;
 -- v153 coordination$patch$);
  if position('-- v154 installation date' in definition)=0 then raise exception 'Unexpected visits command definition';end if;
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
