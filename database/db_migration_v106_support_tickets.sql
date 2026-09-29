-- Incidencias privadas. Aplicar como una transacción; no cambia roles del ERP.
create table public.support_profiles (
  user_id uuid primary key references auth.users(id),
  seller_id uuid not null unique references public.sellers(id),
  created_at timestamptz not null default now()
);
-- Preferir vínculo por ID. El fallback exige email exacto y único en ambas tablas.
insert into public.support_profiles(user_id,seller_id)
select u.id,s.id from auth.users u join public.sellers s on s.id=u.id;
insert into public.support_profiles(user_id,seller_id)
select u.id,s.id from auth.users u join public.sellers s on lower(trim(s.email))=lower(trim(u.email))
where not exists(select 1 from public.support_profiles p where p.user_id=u.id or p.seller_id=s.id)
and u.email_confirmed_at is not null
and (select count(*) from public.sellers x where lower(trim(x.email))=lower(trim(u.email)))=1
and (select count(*) from auth.users x where lower(trim(x.email))=lower(trim(u.email)))=1;

create table public.support_admins(user_id uuid primary key references public.support_profiles(user_id), active boolean not null default true);
-- UUID verificado por inspección de solo lectura, no patrón de correo.
insert into public.support_admins(user_id) select user_id from public.support_profiles where user_id='381df0d1-183f-4ccb-aaf2-8147c76159a9';
create table public.support_sectors(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 2 and 100),active boolean not null default true);
create unique index support_sectors_name on public.support_sectors(lower(trim(name)));
insert into public.support_sectors(name) values ('TI / Sistemas'),('Administración'),('Tesorería y Finanzas'),('Ventas'),('Compras'),('Logística'),('Depósito'),('Mantenimiento'),('General / No sé');
create table public.support_sector_members(sector_id uuid references public.support_sectors(id),user_id uuid references public.support_profiles(user_id),active boolean not null default true,primary key(sector_id,user_id));
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,
  created_by uuid not null references public.support_profiles(user_id),sector_id uuid not null references public.support_sectors(id),
  title text not null check(length(trim(title)) between 5 and 160),description text not null check(length(trim(description)) between 10 and 10000),
  module text not null default '' check(length(module)<=160),steps text not null default '' check(length(steps)<=5000),expected text not null default '' check(length(expected)<=5000),actual text not null default '' check(length(actual)<=5000),impact text not null default '' check(length(impact)<=2000),
  type text not null check(type in ('error','improvement','feature','question','request')),
  suggested_priority text not null default 'medium' check(suggested_priority in ('low','medium','high','critical')),
  priority text not null default 'medium' check(priority in ('low','medium','high','critical')),
  status text not null default 'new' check(status in ('new','in_progress','waiting_requester','waiting_validation','closed','cancelled')),
  assignee_id uuid references public.support_profiles(user_id),version integer not null default 1,
  solution text not null default '',closed_by uuid references public.support_profiles(user_id),closure_kind text check(closure_kind in ('validated','administrative')),closed_at timestamptz,
  reopen_count integer not null default 0,rejected_count integer not null default 0,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(status<>'in_progress' or assignee_id is not null)
);
create index support_tickets_creator on public.support_tickets(created_by,updated_at desc,id desc);
create index support_tickets_sector on public.support_tickets(sector_id,status,updated_at desc,id desc);
create index support_tickets_recent on public.support_tickets(updated_at desc,id desc);
create index support_tickets_assignee on public.support_tickets(assignee_id,status);
create table public.support_messages(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id),author_id uuid not null references public.support_profiles(user_id),body text not null check(length(body)<=10000),visibility text not null check(visibility in ('public','internal')),created_at timestamptz not null default now(),unique(id,ticket_id,visibility));
create index support_messages_ticket on public.support_messages(ticket_id,created_at,id);
create table public.support_action_requests(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id),kind text not null check(kind in ('information','action','validation')),requested_by uuid not null references public.support_profiles(user_id),recipient_id uuid not null references public.support_profiles(user_id),message_id uuid not null references public.support_messages(id),response_id uuid references public.support_messages(id),state text not null default 'open' check(state in ('open','completed','cancelled')),created_at timestamptz not null default now(),completed_at timestamptz);
create unique index support_one_open_action on public.support_action_requests(ticket_id) where state='open';
create table public.support_attachments (
 id uuid primary key default gen_random_uuid(),ticket_id uuid references public.support_tickets(id),message_id uuid,
 created_by uuid not null references public.support_profiles(user_id),visibility text not null check(visibility in ('public','internal')),
 path text not null unique,name text not null check(length(name) between 1 and 180),mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
 bytes integer not null check(bytes between 1 and 10485760),width integer,height integer,
 state text not null default 'reserved' check(state in ('reserved','ready','linked','rejected')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',
 foreign key(message_id,ticket_id,visibility) references public.support_messages(id,ticket_id,visibility),
 check(state<>'linked' or (message_id is not null and ticket_id is not null))
);
create index support_attachments_expiration on public.support_attachments(expires_at) where state<>'linked';
create index support_attachments_message on public.support_attachments(message_id);
create table public.support_events(id uuid primary key default gen_random_uuid(),ticket_id uuid references public.support_tickets(id),actor_id uuid not null references public.support_profiles(user_id),kind text not null,message_id uuid references public.support_messages(id),visibility text not null default 'public' check(visibility in ('public','internal')),details jsonb not null default '{}',created_at timestamptz not null default now());
create index support_events_ticket on public.support_events(ticket_id,created_at desc,id desc);
create table public.support_notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.support_profiles(user_id),ticket_id uuid not null references public.support_tickets(id),event_id uuid not null references public.support_events(id),kind text not null,read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,event_id));
create index support_notifications_user on public.support_notifications(user_id,created_at desc);
create table public.support_reads(user_id uuid references public.support_profiles(user_id),ticket_id uuid references public.support_tickets(id),read_at timestamptz not null default now(),primary key(user_id,ticket_id));
create table public.support_operations(user_id uuid references public.support_profiles(user_id),key uuid,request jsonb not null,result jsonb not null,ticket_id uuid references public.support_tickets(id),created_at timestamptz not null default now(),primary key(user_id,key));
create index support_operations_rate on public.support_operations(user_id,created_at);

-- Internal helpers are callable only by the controlled function owner.
create function public.support_user_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.support_profiles p join public.sellers s on s.id=p.seller_id join auth.users u on u.id=p.user_id where p.user_id=p_user and s.is_active is true and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()));
$$;
create function public.support_user_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
select public.support_user_active(p_user) and exists(select 1 from public.support_admins a where a.user_id=p_user and a.active);
$$;
create function public.support_user_manages(p_user uuid,p_sector uuid) returns boolean language sql stable security definer set search_path='' as $$
select public.support_user_active(p_user) and (public.support_user_admin(p_user) or exists(select 1 from public.support_sector_members m where m.user_id=p_user and m.sector_id=p_sector and m.active));
$$;
create function public.support_is_active() returns boolean language sql stable security definer set search_path='' as $$select public.support_user_active(auth.uid());$$;
-- Provision a newly created ERP user from a server-owned identity, never form data.
create function public.support_register_me() returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid;
begin
 if u is null then raise exception 'SUPPORT_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(106106);
 if not exists(select 1 from public.support_profiles where user_id=u) then
   select id into s from public.sellers where id=u;
   if s is null then
     select x.id into s from public.sellers x join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(trim(x.email))=lower(trim(a.email))
     where (select count(*) from public.sellers y where lower(trim(y.email))=lower(trim(a.email)))=1
       and (select count(*) from auth.users y where lower(trim(y.email))=lower(trim(a.email)))=1;
   end if;
   if s is not null then insert into public.support_profiles(user_id,seller_id) values(u,s) on conflict do nothing; end if;
 end if;
 return public.support_user_active(u);
end;$$;
create function public.support_is_admin() returns boolean language sql stable security definer set search_path='' as $$select public.support_user_admin(auth.uid());$$;
create function public.support_can_read_ticket(p_ticket uuid) returns boolean language sql stable security definer set search_path='' as $$
select public.support_user_active(auth.uid()) and exists(select 1 from public.support_tickets t where t.id=p_ticket and (t.created_by=auth.uid() or public.support_user_manages(auth.uid(),t.sector_id)));
$$;
create function public.support_can_manage_ticket(p_ticket uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.support_tickets t where t.id=p_ticket and public.support_user_manages(auth.uid(),t.sector_id));$$;
create function public.support_can_manage_sector(p_sector uuid) returns boolean language sql stable security definer set search_path='' as $$select public.support_user_manages(auth.uid(),p_sector);$$;
create function public.support_me(p_ticket uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_admin boolean; v_sector uuid; v_result jsonb;
begin
 if not public.support_user_active(v_user) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 v_admin:=public.support_user_admin(v_user);
 if p_ticket is not null then
   if not public.support_can_read_ticket(p_ticket) then raise exception 'SUPPORT_NOT_FOUND'; end if;
   select sector_id into v_sector from public.support_tickets where id=p_ticket;
 end if;
 select jsonb_build_object('user_id',v_user,'is_admin',v_admin,'is_manager',v_admin or exists(select 1 from public.support_sector_members where user_id=v_user and active),
 'sector_ids',coalesce((select jsonb_agg(sector_id) from public.support_sector_members where user_id=v_user and active),'[]'::jsonb),
 'sectors',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name) from public.support_sectors where active or v_admin or id=v_sector),'[]'::jsonb),
 'assignee_ids',coalesce((select jsonb_agg(p.user_id) from public.support_profiles p where v_sector is not null and public.support_user_manages(v_user,v_sector) and public.support_user_manages(p.user_id,v_sector)),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'name',s.full_name,'active',public.support_user_active(p.user_id)) order by s.full_name) from public.support_profiles p join public.sellers s on s.id=p.seller_id
 where v_admin or p.user_id=v_user or (p_ticket is not null and exists(select 1 from public.support_tickets t where t.id=p_ticket and p.user_id in (t.created_by,t.assignee_id))) or (p_ticket is not null and exists(select 1 from public.support_events e where e.ticket_id=p_ticket and e.actor_id=p.user_id and (e.visibility='public' or public.support_user_manages(v_user,v_sector)))) or (v_sector is not null and public.support_user_manages(v_user,v_sector) and public.support_user_manages(p.user_id,v_sector))),'[]'::jsonb)) into v_result;
 return v_result;
end;$$;

-- One command = one transaction, explicit state transitions, immutable actor/creator.
create function public.support_command(p_command text,p_ticket uuid,p_key uuid,p_version integer,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); t public.support_tickets%rowtype; old_status text; op public.support_operations%rowtype;
 req jsonb:=jsonb_build_object('command',p_command,'ticket',p_ticket,'version',p_version,'data',p_data);
 msg uuid; ev uuid; result jsonb; manager boolean; administrator boolean; creator boolean;
 body text:=trim(coalesce(p_data->>'body','')); vis text:=coalesce(p_data->>'visibility','public');
 target uuid; sector uuid; attachment_ids uuid[]; n integer; total_bytes bigint; a public.support_action_requests%rowtype;
begin
 if not public.support_user_active(u) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if p_key is null or jsonb_typeof(p_data)<>'object' then raise exception 'SUPPORT_INVALID'; end if;
 perform pg_advisory_xact_lock(106106);
 -- Serialize retries of the same operation, then test exact payload equality.
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_key::text,0));
 select * into op from public.support_operations where user_id=u and key=p_key;
 if found then
   if op.request<>req then raise exception 'SUPPORT_CONFLICT'; end if;
   if op.ticket_id is not null and not public.support_can_read_ticket(op.ticket_id) then raise exception 'SUPPORT_NOT_FOUND'; end if;
   if p_command in ('sector_save','member_save','admin_save') and not public.support_user_admin(u) then raise exception 'SUPPORT_FORBIDDEN'; end if;
   return op.result;
 end if;
 if (select count(*) from public.support_operations where user_id=u and created_at>now()-interval '1 minute')>=90 then raise exception 'SUPPORT_RATE_LIMIT'; end if;
 administrator:=public.support_user_admin(u);
 if p_command='create' then
   sector:=(p_data->>'sector_id')::uuid;
   if not exists(select 1 from public.support_sectors where id=sector and active) then raise exception 'SUPPORT_INVALID'; end if;
   if p_data->>'suggested_priority'='critical' and length(trim(coalesce(p_data->>'impact','')))<10 then raise exception 'SUPPORT_IMPACT_REQUIRED'; end if;
   insert into public.support_tickets(created_by,sector_id,title,description,module,type,suggested_priority,steps,expected,actual,impact)
   values(u,sector,trim(p_data->>'title'),trim(p_data->>'description'),coalesce(p_data->>'module',''),p_data->>'type',coalesce(p_data->>'suggested_priority','medium'),coalesce(p_data->>'steps',''),coalesce(p_data->>'expected',''),coalesce(p_data->>'actual',''),coalesce(p_data->>'impact','')) returning * into t;
   p_ticket:=t.id; body:=t.description; vis:='public';
 elsif p_command in ('sector_save','member_save','admin_save') then
   if not administrator then raise exception 'SUPPORT_FORBIDDEN'; end if;
   -- Serialize all permissions/config changes with ticket changes.
   perform pg_advisory_xact_lock(106106);
   if p_command='sector_save' then
     sector:=nullif(p_data->>'id','')::uuid;
     if sector is not null and coalesce((p_data->>'active')::boolean,true)=false and exists(select 1 from public.support_tickets where sector_id=sector and status not in ('closed','cancelled')) then raise exception 'SUPPORT_SECTOR_OPEN'; end if;
     if sector is null then insert into public.support_sectors(name) values(trim(p_data->>'name')) returning id into sector;
     else update public.support_sectors set name=trim(p_data->>'name'),active=coalesce((p_data->>'active')::boolean,true) where id=sector; if not found then raise exception 'SUPPORT_NOT_FOUND'; end if; end if;
   else
     target:=(p_data->>'user_id')::uuid; sector:=nullif(p_data->>'sector_id','')::uuid;
     if coalesce((p_data->>'active')::boolean,true) and not public.support_user_active(target) then raise exception 'SUPPORT_INVALID'; end if;
     if p_command='admin_save' then
       if not coalesce((p_data->>'active')::boolean,true) and exists(select 1 from public.support_admins where user_id=target and active) and (select count(*) from public.support_admins where active and public.support_user_active(user_id))<=1 then raise exception 'SUPPORT_LAST_ADMIN'; end if;
       insert into public.support_admins(user_id,active) values(target,coalesce((p_data->>'active')::boolean,true)) on conflict(user_id) do update set active=excluded.active;
     else
       if not exists(select 1 from public.support_sectors where id=sector and active) then raise exception 'SUPPORT_INVALID'; end if;
       insert into public.support_sector_members(sector_id,user_id,active) values(sector,target,coalesce((p_data->>'active')::boolean,true)) on conflict(sector_id,user_id) do update set active=excluded.active;
     end if;
     -- Losing permission sends active work to the unassigned inbox, preserving requests.
     with changed as (
       update public.support_tickets x set assignee_id=null,status=case when x.status='in_progress' then 'new' else x.status end,version=x.version+1,updated_at=clock_timestamp()
       where x.assignee_id=target and x.status not in ('closed','cancelled') and not public.support_user_manages(target,x.sector_id)
       returning x.id,x.status
     ) insert into public.support_events(ticket_id,actor_id,kind,details) select id,u,'unassigned',jsonb_build_object('status',status) from changed;
   end if;
   insert into public.support_events(actor_id,kind,visibility,details) values(u,p_command,'internal',jsonb_build_object('user_id',target,'sector_id',sector,'active',p_data->'active'));
   result:=jsonb_build_object('ok',true); 
 elsif p_command='notification_read' then
   update public.support_notifications set read_at=now() where user_id=u and id=(p_data->>'id')::uuid and public.support_can_read_ticket(ticket_id);
   result:=jsonb_build_object('ok',true);
 elsif p_command='upload_reserve' then
   if vis not in ('public','internal') then raise exception 'SUPPORT_INVALID'; end if;
   if p_ticket is not null then
     if not public.support_can_read_ticket(p_ticket) then raise exception 'SUPPORT_NOT_FOUND'; end if;
     if exists(select 1 from public.support_tickets where id=p_ticket and status in ('closed','cancelled')) then raise exception 'SUPPORT_INVALID'; end if;
   end if;
   if vis='internal' and (p_ticket is null or not public.support_can_manage_ticket(p_ticket)) then raise exception 'SUPPORT_FORBIDDEN'; end if;
   if (select coalesce(sum(bytes),0) from public.support_attachments where created_by=u and state in ('reserved','ready') and expires_at>now())+(p_data->>'bytes')::int>52428800 then raise exception 'SUPPORT_UPLOAD_LIMIT'; end if;
   msg:=gen_random_uuid();
   insert into public.support_attachments(id,ticket_id,created_by,visibility,path,name,mime,bytes) values(msg,p_ticket,u,vis,u::text||'/'||msg::text, p_data->>'name',p_data->>'mime',(p_data->>'bytes')::int);
   result:=jsonb_build_object('id',msg,'path',u::text||'/'||msg::text);
 else
   -- Config and commands share lock: permission changes cannot race a mutation.
   perform pg_advisory_xact_lock(106106);
   if not public.support_can_read_ticket(p_ticket) then raise exception 'SUPPORT_NOT_FOUND'; end if;
   select * into t from public.support_tickets where id=p_ticket for update;
   if p_command='read' then
     insert into public.support_reads(user_id,ticket_id,read_at) values(u,p_ticket,now()) on conflict(user_id,ticket_id) do update set read_at=excluded.read_at;
     update public.support_notifications set read_at=now() where user_id=u and ticket_id=p_ticket;
     result:=jsonb_build_object('ok',true);
   else
     if p_version is distinct from t.version then raise exception 'SUPPORT_CONFLICT'; end if;
     old_status:=t.status; manager:=public.support_user_manages(u,t.sector_id); creator:=t.created_by=u;
     if p_command<>'message' and p_command not in ('respond','validate','reject','reopen') and not manager then raise exception 'SUPPORT_FORBIDDEN'; end if;
     if p_command in ('respond','validate','reject') and not creator then raise exception 'SUPPORT_FORBIDDEN'; end if;
     if p_command not in ('reopen','restore') and t.status in ('closed','cancelled') then raise exception 'SUPPORT_INVALID'; end if;
     if p_command='message' then
       if vis not in ('public','internal') or (vis='internal' and not manager) then raise exception 'SUPPORT_FORBIDDEN'; end if;
       if body='' and jsonb_array_length(coalesce(p_data->'attachments','[]'))=0 then raise exception 'SUPPORT_BODY_REQUIRED'; end if;
     elsif p_command in ('take','assign') then
       target:=case when p_command='take' then u else (p_data->>'assignee_id')::uuid end;
       if not public.support_user_manages(target,t.sector_id) then raise exception 'SUPPORT_INVALID'; end if;
       t.assignee_id:=target; if t.status='new' then t.status:='in_progress'; end if;
     elsif p_command='classify' then
       if p_data->>'priority' not in ('low','medium','high','critical') or p_data->>'type' not in ('error','improvement','feature','question','request') then raise exception 'SUPPORT_INVALID'; end if;
       t.priority:=p_data->>'priority';t.type:=p_data->>'type';t.module:=coalesce(p_data->>'module',t.module);
     elsif p_command in ('request_info','request_action','request_validation') then
       if body='' then raise exception 'SUPPORT_BODY_REQUIRED'; end if;
       if not public.support_user_active(t.created_by) then raise exception 'SUPPORT_REQUESTER_INACTIVE'; end if;
       if t.status not in ('new','in_progress') or (p_command='request_validation' and t.status<>'in_progress') then raise exception 'SUPPORT_INVALID'; end if;
       if t.assignee_id is null then t.assignee_id:=u; end if;
       if p_command='request_validation' then
         if length(trim(coalesce(p_data->>'solution','')))=0 then raise exception 'SUPPORT_SOLUTION_REQUIRED'; end if;
         t.solution:=trim(p_data->>'solution');t.status:='waiting_validation';
       else t.status:='waiting_requester'; end if;
     elsif p_command in ('respond','validate','reject') then
       select * into a from public.support_action_requests where ticket_id=t.id and state='open' for update;
       if not found or a.recipient_id<>u or (p_command='respond' and t.status<>'waiting_requester') or (p_command in ('validate','reject') and t.status<>'waiting_validation') then raise exception 'SUPPORT_INVALID'; end if;
       if (p_command='reject' and body='') or (p_command='respond' and body='' and jsonb_array_length(coalesce(p_data->'attachments','[]'))=0) then raise exception 'SUPPORT_BODY_REQUIRED'; end if;
       if p_command='validate' then
         if coalesce((p_data->>'confirmed')::boolean,false)=false then raise exception 'SUPPORT_INVALID'; end if;
         t.status:='closed';t.closed_by:=u;t.closure_kind:='validated';t.closed_at:=now();body:=coalesce(nullif(body,''),'Confirmo que la solución funciona.');
       else
         if t.assignee_id is not null and public.support_user_manages(t.assignee_id,t.sector_id) then t.status:='in_progress'; else t.status:='new';t.assignee_id:=null; end if;
         if p_command='reject' then t.rejected_count:=t.rejected_count+1; end if;
       end if;
     elsif p_command in ('withdraw','cancel','close_admin','reopen','restore') then
       if body='' then raise exception 'SUPPORT_BODY_REQUIRED'; end if;
       if p_command in ('cancel','close_admin','restore') and not administrator then raise exception 'SUPPORT_FORBIDDEN'; end if;
       if p_command='withdraw' then
         if t.status not in ('waiting_requester','waiting_validation') then raise exception 'SUPPORT_INVALID'; end if;
         if t.assignee_id is not null and public.support_user_manages(t.assignee_id,t.sector_id) then t.status:='in_progress'; else t.status:='new';t.assignee_id:=null; end if;
       elsif p_command='cancel' then t.status:='cancelled';
       elsif p_command='close_admin' then t.status:='closed';t.closed_by:=u;t.closure_kind:='administrative';t.closed_at:=now();
       elsif p_command='reopen' then
         if t.status<>'closed' then raise exception 'SUPPORT_INVALID'; end if;
         if t.assignee_id is not null and public.support_user_manages(t.assignee_id,t.sector_id) then t.status:='in_progress'; else t.status:='new';t.assignee_id:=null; end if;
         t.closed_at:=null;t.closed_by:=null;t.closure_kind:=null;t.reopen_count:=t.reopen_count+1;
       else
         if t.status<>'cancelled' then raise exception 'SUPPORT_INVALID'; end if;
         t.status:='new';t.assignee_id:=null;
       end if;
       update public.support_action_requests set state='cancelled',completed_at=now() where ticket_id=t.id and state='open';
     elsif p_command='transfer' then
       if not administrator or body='' then raise exception 'SUPPORT_FORBIDDEN'; end if;
       sector:=(p_data->>'sector_id')::uuid;target:=nullif(p_data->>'assignee_id','')::uuid;
       if not exists(select 1 from public.support_sectors where id=sector and active) or (target is not null and not public.support_user_manages(target,sector)) then raise exception 'SUPPORT_INVALID'; end if;
       t.sector_id:=sector;t.assignee_id:=target;
       if t.status in ('new','in_progress') then t.status:=case when target is null then 'new' else 'in_progress' end; end if;
     else raise exception 'SUPPORT_INVALID'; end if;
     if p_command<>'message' then vis:='public'; end if;
   end if;
 end if;

 if result is null then
   if length(body)>10000 then raise exception 'SUPPORT_INVALID'; end if;
   select coalesce(array_agg(value::uuid),'{}'::uuid[]) into attachment_ids from jsonb_array_elements_text(coalesce(p_data->'attachments','[]'));
   if cardinality(attachment_ids)>5 or (select count(distinct x) from unnest(attachment_ids) x)<>cardinality(attachment_ids) then raise exception 'SUPPORT_UPLOAD_LIMIT'; end if;
   -- Lock each reserve, verify owner/context/visibility/expiry and ready state.
   perform 1 from public.support_attachments where id=any(attachment_ids) order by id for update;
   select count(*),coalesce(sum(bytes),0) into n,total_bytes from public.support_attachments where id=any(attachment_ids) and created_by=u and state='ready' and expires_at>now() and visibility=vis and (ticket_id=t.id or (p_command='create' and ticket_id is null));
   if n<>cardinality(attachment_ids) or total_bytes>26214400 then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
   if body<>'' or n>0 then
     msg:=gen_random_uuid();
     insert into public.support_messages(id,ticket_id,author_id,body,visibility) values(msg,t.id,u,body,vis);
     update public.support_attachments set ticket_id=t.id,message_id=msg,state='linked' where id=any(attachment_ids);
   end if;
   if p_command in ('request_info','request_action','request_validation') then
     insert into public.support_action_requests(ticket_id,kind,requested_by,recipient_id,message_id) values(t.id,case p_command when 'request_validation' then 'validation' when 'request_action' then 'action' else 'information' end,u,t.created_by,msg);
   elsif p_command in ('respond','validate','reject') then
     update public.support_action_requests set state='completed',completed_at=now(),response_id=msg where id=a.id;
   end if;
   -- Internal activity must not change public version or public last activity.
   if p_command<>'create' and vis='public' then
     update public.support_tickets set sector_id=t.sector_id,assignee_id=t.assignee_id,status=t.status,priority=t.priority,type=t.type,module=t.module,solution=t.solution,closed_by=t.closed_by,closure_kind=t.closure_kind,closed_at=t.closed_at,reopen_count=t.reopen_count,rejected_count=t.rejected_count,version=version+1,updated_at=clock_timestamp() where id=t.id returning * into t;
   end if;
   insert into public.support_events(ticket_id,actor_id,kind,message_id,visibility,details) values(t.id,u,p_command,msg,vis,jsonb_build_object('from',old_status,'status',t.status,'assignee_id',t.assignee_id,'priority',t.priority,'sector_id',t.sector_id)) returning id into ev;
   -- Notify counterparts only; no text copied from conversation.
   insert into public.support_notifications(user_id,ticket_id,event_id,kind)
   select distinct p.user_id,t.id,ev,p_command from public.support_profiles p
   where p.user_id<>u and public.support_user_active(p.user_id) and (
     (vis='public' and p.user_id=t.created_by)
     or (p_command='create' and public.support_user_manages(p.user_id,t.sector_id))
     or p.user_id=t.assignee_id
     or (t.assignee_id is null and public.support_user_admin(p.user_id))
   ) and (vis='public' or public.support_user_manages(p.user_id,t.sector_id))
   on conflict(user_id,event_id) do nothing;
   result:=jsonb_build_object('id',t.id,'version',t.version);
 end if;
 insert into public.support_operations(user_id,key,request,result,ticket_id) values(u,p_key,req,result,p_ticket);
 return result;
end;$$;

-- Trusted upload finalization. Browser role cannot mark unvalidated files ready.
create function public.support_finish_upload(p_id uuid,p_user uuid,p_width integer,p_height integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.support_attachments%rowtype;
begin
 perform pg_advisory_xact_lock(106106);
 select * into a from public.support_attachments where id=p_id and created_by=p_user for update;
 if not found or not public.support_user_active(p_user) or a.state<>'reserved' or a.expires_at<=now() then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 if a.ticket_id is not null and not exists(select 1 from public.support_tickets t where t.id=a.ticket_id and t.status not in ('closed','cancelled') and (t.created_by=p_user or public.support_user_manages(p_user,t.sector_id))) then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 if a.visibility='internal' and not exists(select 1 from public.support_tickets t where t.id=a.ticket_id and public.support_user_manages(p_user,t.sector_id)) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if p_width<=0 or p_height<=0 or p_width::bigint*p_height>100000000 then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 update public.support_attachments set state='ready',width=p_width,height=p_height where id=p_id;
end;$$;

do $$declare tab text; fn record; begin
 foreach tab in array array['support_profiles','support_admins','support_sectors','support_sector_members','support_tickets','support_messages','support_action_requests','support_attachments','support_events','support_notifications','support_reads','support_operations'] loop
   execute format('alter table public.%I enable row level security',tab);
   execute format('revoke all on public.%I from anon,authenticated',tab);
   execute format('grant select on public.%I to authenticated',tab);
   execute format('grant all on public.%I to service_role',tab);
 end loop;
 for fn in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'support_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 end loop;
end;$$;
grant execute on function public.support_is_active(),public.support_register_me(),public.support_is_admin(),public.support_can_read_ticket(uuid),public.support_can_manage_ticket(uuid),public.support_can_manage_sector(uuid),public.support_me(uuid),public.support_command(text,uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.support_finish_upload(uuid,uuid,integer,integer) to service_role;
-- Every child row inherits scope and internal visibility from its parent.
create policy support_profile_read on public.support_profiles for select to authenticated using(public.support_is_active() and (user_id=auth.uid() or public.support_is_admin()));
create policy support_admin_read on public.support_admins for select to authenticated using(public.support_is_active() and (user_id=auth.uid() or public.support_is_admin()));
create policy support_sector_read on public.support_sectors for select to authenticated using(public.support_is_active());
create policy support_member_read on public.support_sector_members for select to authenticated using(public.support_is_active() and (user_id=auth.uid() or public.support_is_admin()));
create policy support_ticket_read on public.support_tickets for select to authenticated using((select public.support_is_active()) and (created_by=(select auth.uid()) or (select public.support_is_admin()) or public.support_can_manage_sector(sector_id)));
create policy support_message_read on public.support_messages for select to authenticated using(public.support_can_read_ticket(ticket_id) and (visibility='public' or public.support_can_manage_ticket(ticket_id)));
create policy support_action_read on public.support_action_requests for select to authenticated using(public.support_can_read_ticket(ticket_id));
create policy support_attachment_read on public.support_attachments for select to authenticated using(public.support_is_active() and ((state in ('reserved','ready') and created_by=auth.uid() and (ticket_id is null or public.support_can_read_ticket(ticket_id)) and (visibility='public' or public.support_can_manage_ticket(ticket_id))) or (state='linked' and public.support_can_read_ticket(ticket_id) and (visibility='public' or public.support_can_manage_ticket(ticket_id)))));
create policy support_event_read on public.support_events for select to authenticated using((ticket_id is not null and public.support_can_read_ticket(ticket_id) and (visibility='public' or public.support_can_manage_ticket(ticket_id))) or (ticket_id is null and public.support_is_admin()));
create policy support_notification_read on public.support_notifications for select to authenticated using(user_id=auth.uid() and public.support_can_read_ticket(ticket_id) and exists(select 1 from public.support_events e where e.id=event_id));
create policy support_reads_read on public.support_reads for select to authenticated using(user_id=auth.uid() and public.support_can_read_ticket(ticket_id));
create policy support_operation_read on public.support_operations for select to authenticated using(user_id=auth.uid() and public.support_is_active() and (ticket_id is null or public.support_can_read_ticket(ticket_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('support-attachments','support-attachments',false,10485760,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive guard also blocks legacy permissive policies from exposing this bucket.
create policy support_storage_private on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'support-attachments') with check(bucket_id<>'support-attachments');
