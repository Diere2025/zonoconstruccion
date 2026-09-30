-- Save the single edit form atomically using the existing audited commands.
-- v124's textual patch also matched the transfer line. Keep the required-choice
-- checks on creation and remove that accidental duplicate from transfer.
do $repair$
declare source text; transfer_start integer; checks text;
begin
 perform pg_advisory_xact_lock(106106);
 source:=pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure);
 transfer_start:=strpos(source,'elsif p_command=''transfer'' then');
 if transfer_start=0 then raise exception 'Unexpected support transfer definition'; end if;
 checks:=$patch$   if coalesce(p_data->>'responsibility_kind','') not in ('area','person') then raise exception 'SUPPORT_RESPONSIBLE_REQUIRED'; end if;
   target:=nullif(p_data->>'assignee_id','')::uuid;
   if p_data->>'responsibility_kind'='person' and (target is null or not public.support_user_manages(target,sector)) then raise exception 'SUPPORT_RESPONSIBLE_INVALID'; end if;
   if p_data->>'responsibility_kind'='area' and target is not null then raise exception 'SUPPORT_RESPONSIBLE_INVALID'; end if;
   if not public.support_area_has_responsibles(sector) then raise exception 'SUPPORT_AREA_EMPTY'; end if;$patch$;
 if strpos(substr(source,transfer_start),checks)>0 then
  source:=left(source,transfer_start-1)||replace(substr(source,transfer_start),checks,'');
  execute source;
 end if;
end $repair$;

create or replace function public.support_edit_ticket(p_ticket uuid,p_key uuid,p_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); t public.support_tickets%rowtype; op public.support_operations%rowtype;
 req jsonb:=jsonb_build_object('command','edit','ticket',p_ticket,'version',p_version,'data',p_data);
 sector uuid; target uuid; result jsonb; version integer;
begin
 if not public.support_user_active(u) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if p_key is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'SUPPORT_INVALID'; end if;
 perform pg_advisory_xact_lock(106106);
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_key::text,0));
 if not public.support_can_read_ticket(p_ticket) then raise exception 'SUPPORT_NOT_FOUND'; end if;
 select * into op from public.support_operations where user_id=u and key=p_key;
 if found then
  if op.request<>req then raise exception 'SUPPORT_CONFLICT'; end if;
  return op.result;
 end if;
 if (select count(*) from public.support_operations where user_id=u and created_at>now()-interval '1 minute')>=90 then raise exception 'SUPPORT_RATE_LIMIT'; end if;
 select * into t from public.support_tickets where id=p_ticket for update;
 if not public.support_user_manages(u,t.sector_id) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if p_version is distinct from t.version then raise exception 'SUPPORT_CONFLICT'; end if;
 if t.status in ('closed','cancelled') then raise exception 'SUPPORT_INVALID'; end if;
 sector:=nullif(p_data->>'sector_id','')::uuid;
 target:=nullif(p_data->>'assignee_id','')::uuid;
 if coalesce(p_data->>'responsibility_kind','') not in ('area','person') then raise exception 'SUPPORT_RESPONSIBLE_REQUIRED'; end if;
 if sector is null or not public.support_area_has_responsibles(sector) then raise exception 'SUPPORT_AREA_EMPTY'; end if;
 if (p_data->>'responsibility_kind'='area' and target is not null)
  or (p_data->>'responsibility_kind'='person' and (target is null or not public.support_user_manages(target,sector))) then raise exception 'SUPPORT_RESPONSIBLE_INVALID'; end if;
 version:=t.version;
 if sector is distinct from t.sector_id then
  result:=public.support_command('transfer',p_ticket,gen_random_uuid(),version,
   jsonb_build_object('sector_id',sector,'assignee_id',target,'body',p_data->>'body'));
  version:=(result->>'version')::integer;
 elsif target is distinct from t.assignee_id then
  result:=public.support_command('assign',p_ticket,gen_random_uuid(),version,
   jsonb_build_object('assignee_id',target,'responsibility_kind',p_data->>'responsibility_kind'));
  version:=(result->>'version')::integer;
 end if;
 if p_data->>'priority' is distinct from t.priority or p_data->>'type' is distinct from t.type then
  if p_data->>'priority' is null or p_data->>'type' is null then raise exception 'SUPPORT_INVALID'; end if;
  result:=public.support_command('classify',p_ticket,gen_random_uuid(),version,
   jsonb_build_object('priority',p_data->>'priority','type',p_data->>'type'));
  version:=(result->>'version')::integer;
 end if;
 result:=jsonb_build_object('id',p_ticket,'version',version);
 insert into public.support_operations(user_id,key,request,result,ticket_id) values(u,p_key,req,result,p_ticket);
 return result;
end;$$;
revoke all on function public.support_edit_ticket(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.support_edit_ticket(uuid,uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
