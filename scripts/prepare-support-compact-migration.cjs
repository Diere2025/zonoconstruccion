const fs = require('node:fs');
const source = fs.readFileSync('database/db_migration_v106_support_tickets.sql','utf8');
const start = source.indexOf('create function public.support_command(');
const end = source.indexOf('\nend;$$;',start) + '\nend;$$;'.length;
let command = source.slice(start,end).replace('create function','create or replace function');
const old = "if t.status not in ('new','in_progress') or (p_command='request_validation' and t.status<>'in_progress') then raise exception 'SUPPORT_INVALID'; end if;";
if (!command.includes(old)) throw new Error('Unexpected command definition');
command = command.replace(old,"if t.status not in ('new','in_progress') then raise exception 'SUPPORT_INVALID'; end if;");
const names = `
create or replace function public.support_ticket_people(p_tickets uuid[]) returns table(id uuid,name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.support_user_active(auth.uid()) or coalesce(array_length(p_tickets,1),0)>100 then raise exception 'SUPPORT_FORBIDDEN'; end if;
 return query select distinct p.user_id,s.full_name from public.support_profiles p join public.sellers s on s.id=p.seller_id
 join public.support_tickets t on p.user_id in (t.created_by,t.assignee_id)
 where t.id=any(p_tickets) and public.support_can_read_ticket(t.id);
end;$$;
revoke all on function public.support_ticket_people(uuid[]) from public,anon,authenticated;
grant execute on function public.support_ticket_people(uuid[]) to authenticated;
`;
fs.writeFileSync('database/db_migration_v109_support_compact_workflow.sql', '-- Review from New is atomic; participant names are scoped to readable tickets.\n'+command+'\n'+names);
