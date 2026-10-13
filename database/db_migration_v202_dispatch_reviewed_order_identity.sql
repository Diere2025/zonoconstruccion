-- Preserve the reviewed LK01606 order identity when the legacy code has two ERP records.
begin;
do $migration$
declare definition text; original text; reviewed text;
begin
 original := 'case when count(*)=1 then (array_agg(id))[1] end id from orders';
 reviewed := 'case when count(*)=1 then (array_agg(id))[1] when x."orderCode"=''LK01606'' and bool_or(id=''733ed5c8-2862-44fe-a5a5-0d953b0fe4c8''::uuid) then ''733ed5c8-2862-44fe-a5a5-0d953b0fe4c8''::uuid end id from orders';
 select pg_get_functiondef('public.sync_logistics_dispatch_links(uuid,jsonb)'::regprocedure) into definition;
 if position(reviewed in definition)>0 then return; end if;
 if position(original in definition)=0 then raise exception 'Unexpected dispatch order lookup: migration not applied'; end if;
 execute replace(definition,original,reviewed);
end $migration$;
notify pgrst,'reload schema';
commit;
