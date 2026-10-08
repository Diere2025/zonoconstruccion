alter table public.visit_cases add column if not exists requested_date date;
alter table public.visit_cases add column if not exists requested_time time;
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 if position('-- v153 coordination' in definition)=0 then
  definition:=replace(definition,'if nullif(p_data->>''scheduled_date'','''') is not null then','if nullif(p_data->>''scheduled_date'','''') is not null and nullif(p_data->>''scheduled_time'','''') is not null then');
  definition:=replace(definition,' -- v150 commercial fields',$patch$
 -- v153 coordination
 if p_command='create' then
  update public.visit_cases set requested_date=nullif(p_data->>'scheduled_date','')::date,requested_time=nullif(p_data->>'scheduled_time','')::time where id=p_case;
 end if;
 -- v150 commercial fields$patch$);
  if position('-- v153 coordination' in definition)=0 then raise exception 'Unexpected visits command definition';end if;
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
