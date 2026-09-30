-- sector_id is the responsible area; a null assignee_id assigns its team.
-- The affected module/area remains the independent `module` field.
create or replace function public.support_area_has_responsibles(p_sector uuid)
returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.support_sectors s where s.id=p_sector and s.active
 and exists(select 1 from public.support_profiles p where public.support_user_manages(p.user_id,s.id)));
$$;
revoke all on function public.support_area_has_responsibles(uuid) from public,anon,authenticated,service_role;

-- The creation picker exposes names and assignment eligibility, never private contact data.
create or replace function public.support_responsibility_options()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.support_user_active(auth.uid()) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 return jsonb_build_object(
  'sectors',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'active',s.active) order by s.name)
   from public.support_sectors s where public.support_area_has_responsibles(s.id)),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'name',s.full_name,'active',true,
   'sector_ids',(select jsonb_agg(a.id) from public.support_sectors a where a.active and public.support_user_manages(p.user_id,a.id))) order by s.full_name)
   from public.support_profiles p join public.sellers s on s.id=p.seller_id
   where public.support_user_active(p.user_id) and exists(select 1 from public.support_sectors a where a.active and public.support_user_manages(p.user_id,a.id))),'[]'::jsonb));
end;$$;
revoke all on function public.support_responsibility_options() from public,anon,authenticated,service_role;
grant execute on function public.support_responsibility_options() to authenticated;

-- Patch the installed private core so shipping and all prior permission fixes are retained.
do $migration$
declare source text; old text; replacement text;
begin
 perform pg_advisory_xact_lock(106106);
 source:=pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure);
 if strpos(source,'SUPPORT_RESPONSIBLE_REQUIRED')>0 then return; end if;
 old:='   sector:=(p_data->>''sector_id'')::uuid;';
 replacement:=$patch$   sector:=(p_data->>'sector_id')::uuid;
   if coalesce(p_data->>'responsibility_kind','') not in ('area','person') then raise exception 'SUPPORT_RESPONSIBLE_REQUIRED'; end if;
   target:=nullif(p_data->>'assignee_id','')::uuid;
   if p_data->>'responsibility_kind'='person' and (target is null or not public.support_user_manages(target,sector)) then raise exception 'SUPPORT_RESPONSIBLE_INVALID'; end if;
   if p_data->>'responsibility_kind'='area' and target is not null then raise exception 'SUPPORT_RESPONSIBLE_INVALID'; end if;
   if not public.support_area_has_responsibles(sector) then raise exception 'SUPPORT_AREA_EMPTY'; end if;$patch$;
 if strpos(source,old)=0 then raise exception 'Unexpected support create definition'; end if;
 source:=replace(source,old,replacement);
 old:='insert into public.support_tickets(created_by,sector_id,title,';
 if strpos(source,old)=0 then raise exception 'Unexpected support ticket insert'; end if;
 source:=replace(source,old,'insert into public.support_tickets(created_by,sector_id,assignee_id,title,');
 old:='values(u,sector,trim(p_data->>''title'')';
 if strpos(source,old)=0 then raise exception 'Unexpected support ticket values'; end if;
 source:=replace(source,old,'values(u,sector,target,trim(p_data->>''title'')');
 old:=$patch$       target:=case when p_command='take' then u else (p_data->>'assignee_id')::uuid end;
       if not public.support_user_manages(target,t.sector_id) then raise exception 'SUPPORT_INVALID'; end if;
       t.assignee_id:=target; if t.status='new' then t.status:='in_progress'; end if;$patch$;
 replacement:=$patch$       target:=case when p_command='take' then u else nullif(p_data->>'assignee_id','')::uuid end;
       if target is null then
         if p_command<>'assign' or p_data->>'responsibility_kind' is distinct from 'area' then raise exception 'SUPPORT_RESPONSIBLE_REQUIRED'; end if;
         if not public.support_area_has_responsibles(t.sector_id) then raise exception 'SUPPORT_AREA_EMPTY'; end if;
       elsif not public.support_user_manages(target,t.sector_id) then raise exception 'SUPPORT_RESPONSIBLE_INVALID'; end if;
       t.assignee_id:=target;
       if t.status in ('new','in_progress') then t.status:=case when target is null then 'new' else 'in_progress' end; end if;$patch$;
 if strpos(source,old)=0 then raise exception 'Unexpected support assignment definition'; end if;
 source:=replace(source,old,replacement);
 old:='(t.assignee_id is null and public.support_user_admin(p.user_id))';
 if strpos(source,old)=0 then raise exception 'Unexpected support team notifications'; end if;
 source:=replace(source,old,'(t.assignee_id is null and public.support_user_manages(p.user_id,t.sector_id))');
 execute source;

 -- Shipping always goes to the logistics team, with the same required assignment rule.
 source:=pg_get_functiondef('public.support_command(text,uuid,uuid,integer,jsonb)'::regprocedure);
 old:='data:=p_data||jsonb_build_object(''sector_id'',sector,''type'',''request'',';
 if strpos(source,old)=0 then raise exception 'Unexpected shipping assignment definition'; end if;
 source:=replace(source,old,'data:=p_data||jsonb_build_object(''sector_id'',sector,''responsibility_kind'',''area'',''assignee_id'',null,''type'',''request'',');
 execute source;
end $migration$;
revoke all on function public.support_command_core(text,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
