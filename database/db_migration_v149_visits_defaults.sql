-- Valor por defecto para visitas nuevas; no modifica valores ya acordados.
alter table public.visit_integration_settings add column if not exists default_visit_fee numeric(15,2) not null default 50000 check(default_visit_fee between 0 and 100000000);
create or replace function public.visits_session() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
 if not public.visits_active() then raise exception 'VISITS_FORBIDDEN'; end if;
 select jsonb_build_object('id',s.id,'name',s.full_name,'commercial',public.visits_commercial(),'administrator','admin'=any(public.visits_roles()),
 'default_visit_fee',(select default_visit_fee from public.visit_integration_settings where id=true),
 'default_installer_id',(select id from public.sellers where lower(trim(email))='juan.herrera@zono.com.ar' and is_active is true and (coalesce(roles,array[]::text[])||array[role]) @> array['instalador'] limit 1),
 'people',public.visits_people(),'kits',coalesce((select jsonb_agg(public.visits_kit(p.id) order by p.name) from public.products p where (p.is_active is distinct from false or p.id='f3eebe3d-ed24-4801-b315-db5cd5011a72') and lower(p.name) like '%kit instalaci%' and lower(p.name) not like '%adicional%'),'[]')) into r
 from public.sellers s where s.id=public.visits_profile(); return r;
end $$;
-- Keep direct RPC creation consistent with the configurable default.
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 if position('visit_fee=coalesce(nullif(p_data->>''visit_fee'','''')::numeric,0)' in definition)>0 then
   definition:=replace(definition,'visit_fee=coalesce(nullif(p_data->>''visit_fee'','''')::numeric,0)','visit_fee=coalesce(nullif(p_data->>''visit_fee'','''')::numeric,(select default_visit_fee from public.visit_integration_settings where id=true),50000)');
   execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
