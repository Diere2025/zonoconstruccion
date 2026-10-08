-- Administration grants visibility, not subscription to every area's activity.
create or replace function public.support_user_in_area(p_user uuid,p_sector uuid)
returns boolean language sql stable security definer set search_path='' as $$
select public.support_user_active(p_user) and exists(
 select 1 from public.support_sector_members m join public.support_sectors s on s.id=m.sector_id
 where m.user_id=p_user and m.sector_id=p_sector and m.active and s.active);
$$;
revoke all on function public.support_user_in_area(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.support_user_in_area(uuid,uuid) to authenticated;

do $migration$
declare source text; old text;
begin
 perform pg_advisory_xact_lock(106106);
 source:=pg_get_functiondef('public.support_command_core(text,uuid,uuid,integer,jsonb)'::regprocedure);
 old:=$patch$     or (p_command='create' and public.support_user_manages(p.user_id,t.sector_id))
     or p.user_id=t.assignee_id
     or (t.assignee_id is null and public.support_user_manages(p.user_id,t.sector_id))$patch$;
 if strpos(source,old)>0 then
  source:=replace(source,old,$patch$     or p.user_id=t.assignee_id
     or (t.assignee_id is null and public.support_user_in_area(p.user_id,t.sector_id))$patch$);
  execute source;
 elsif strpos(source,'public.support_user_in_area(p.user_id,t.sector_id)')=0 then
  raise exception 'Unexpected support notification recipients';
 end if;
end $migration$;

-- Hide old incidental subscriptions too, without deleting notification history.
drop policy if exists support_notification_read on public.support_notifications;
create policy support_notification_read on public.support_notifications for select to authenticated
using(user_id=auth.uid() and public.support_can_read_ticket(ticket_id)
 and exists(select 1 from public.support_events e where e.id=event_id)
 and exists(select 1 from public.support_tickets t where t.id=ticket_id
  and (t.created_by=auth.uid() or t.assignee_id=auth.uid()
   or (t.assignee_id is null and public.support_user_in_area(auth.uid(),t.sector_id)))));

-- One scoped write for all visible cards, or all notices existing at click time.
create or replace function public.support_read_notifications(p_ids uuid[] default null,p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if not public.support_user_active(auth.uid()) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if (p_ids is null)=(p_before is null) or cardinality(p_ids)>40 then raise exception 'SUPPORT_INVALID'; end if;
 update public.support_notifications n set read_at=clock_timestamp()
 where n.user_id=auth.uid() and n.read_at is null
  and (n.id=any(p_ids) or n.created_at<=least(p_before,clock_timestamp()))
  and public.support_can_read_ticket(n.ticket_id)
  and exists(select 1 from public.support_events e where e.id=n.event_id
   and (e.visibility='public' or public.support_can_manage_ticket(n.ticket_id)));
 get diagnostics changed=row_count;
 return jsonb_build_object('ok',true,'updated',changed);
end $$;
revoke all on function public.support_read_notifications(uuid[],timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.support_read_notifications(uuid[],timestamptz) to authenticated;
notify pgrst,'reload schema';
