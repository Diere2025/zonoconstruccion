-- Diego receives his own tickets and TI / Sistemas in both notification channels.
-- Other users keep their existing personal/team subscription.
create or replace function public.support_notification_subscribed(p_user uuid,p_creator uuid,p_assignee uuid,p_sector uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_user='381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid then
   p_creator=p_user or coalesce(p_assignee=p_user,false)
   or p_sector='b5da36c8-e964-4db9-9a71-dd11066bdc7a'::uuid
 else p_creator=p_user or coalesce(p_assignee=p_user,false)
   or (p_assignee is null and public.support_user_in_area(p_user,p_sector)) end;
$$;
revoke all on function public.support_notification_subscribed(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.support_notification_subscribed(uuid,uuid,uuid,uuid) to authenticated;

do $migration$
declare source text; old text;
begin
 perform pg_advisory_xact_lock(106106);
 source:=pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure);
 old:=$patch$     (vis='public' and p.user_id=t.created_by)
     or p.user_id=t.assignee_id
     or (t.assignee_id is null and public.support_user_in_area(p.user_id,t.sector_id))$patch$;
 if strpos(source,old)>0 then
  execute replace(source,old,'     public.support_notification_subscribed(p.user_id,t.created_by,t.assignee_id,t.sector_id)');
 elsif strpos(source,'public.support_notification_subscribed(p.user_id,t.created_by,t.assignee_id,t.sector_id)')=0 then
  raise exception 'Unexpected support notification recipients';
 end if;

 -- Check the current ticket when claiming, so queued logistics alerts also stop.
 source:=pg_get_functiondef('public.support_claim_telegram_jobs(uuid,integer)'::regprocedure);
 old:='and (p_ticket is null or j.ticket_id=p_ticket)';
 if strpos(source,'public.support_notification_subscribed(')=0 then
  if strpos(source,old)=0 then raise exception 'Unexpected Telegram claim definition'; end if;
  execute replace(source,old,old||$patch$
   and exists(select 1 from public.support_tickets t where t.id=j.ticket_id and t.workflow='incident'
    and public.support_notification_subscribed('381df0d1-183f-4ccb-aaf2-8147c76159a9',t.created_by,t.assignee_id,t.sector_id))$patch$);
 end if;
end $migration$;

drop policy if exists support_notification_read on public.support_notifications;
create policy support_notification_read on public.support_notifications for select to authenticated
using(user_id=auth.uid() and public.support_can_read_ticket(ticket_id)
 and exists(select 1 from public.support_events e where e.id=event_id)
 and exists(select 1 from public.support_tickets t where t.id=ticket_id
  and public.support_notification_subscribed(auth.uid(),t.created_by,t.assignee_id,t.sector_id)));

create or replace function public.support_enqueue_telegram() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare destination text; creator text;
begin
 if new.workflow<>'incident' or not public.support_notification_subscribed(
  '381df0d1-183f-4ccb-aaf2-8147c76159a9',new.created_by,new.assignee_id,new.sector_id) then return new; end if;
 select chat_id into destination from public.support_telegram_settings where id and enabled;
 if destination is null then return new; end if;
 select s.full_name into creator from public.support_profiles p join public.sellers s on s.id=p.seller_id where p.user_id=new.created_by;
 insert into public.support_telegram_jobs(ticket_id,ticket_number,title,creator_name,priority,chat_id)
 values(new.id,new.number,new.title,coalesce(nullif(trim(creator),''),'Usuario del ERP'),new.priority,destination)
 on conflict(ticket_id) do nothing;
 return new;
end $$;
revoke all on function public.support_enqueue_telegram() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
