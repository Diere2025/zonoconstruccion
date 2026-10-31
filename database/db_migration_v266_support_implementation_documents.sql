-- Add an implementation category and private downloadable PDF documents.
-- Existing permissions, image validation, file limits and ticket audience remain in force.
alter table public.support_tickets drop constraint support_tickets_type_check;
alter table public.support_tickets add constraint support_tickets_type_check check(type in ('error','improvement','feature','implementation','question','request'));
alter table public.support_attachments drop constraint support_attachments_mime_check;
alter table public.support_attachments add constraint support_attachments_mime_check check(mime in ('image/png','image/jpeg','image/webp','application/pdf'));
do $migration$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.proname like 'support_command%' or p.proname like 'support_edit_ticket%') loop
  definition:=pg_get_functiondef(f.oid);
  if position('''error'',''improvement'',''feature'',''question'',''request''' in definition)>0 then
   definition:=replace(definition,'''error'',''improvement'',''feature'',''question'',''request''','''error'',''improvement'',''feature'',''implementation'',''question'',''request''');
   execute definition;
  end if;
 end loop;
end;$migration$;
CREATE OR REPLACE FUNCTION public.support_finish_upload(p_id uuid, p_user uuid, p_width integer, p_height integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.support_attachments%rowtype;
begin
 perform pg_advisory_xact_lock(106106);
 select * into a from public.support_attachments where id=p_id and created_by=p_user for update;
 if not found or not public.support_user_active(p_user) or a.state<>'reserved' or a.expires_at<=now() then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 if a.ticket_id is not null and not exists(select 1 from public.support_tickets t where t.id=a.ticket_id and t.status not in ('closed','cancelled') and (t.created_by=p_user or public.support_user_manages(p_user,t.sector_id))) then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 if a.visibility='internal' and not exists(select 1 from public.support_tickets t where t.id=a.ticket_id and public.support_user_manages(p_user,t.sector_id)) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if a.mime='application/pdf' then
  if p_width is not null or p_height is not null then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 else
  if p_width is null or p_height is null or p_width<=0 or p_height<=0 or p_width::bigint*p_height>100000000 then raise exception 'SUPPORT_UPLOAD_INVALID'; end if;
 end if;
 update public.support_attachments set state='ready',width=p_width,height=p_height where id=p_id;
end;$function$;

update storage.buckets set allowed_mime_types=array['image/png','image/jpeg','image/webp','application/pdf'] where id='support-attachments' and public=false;
