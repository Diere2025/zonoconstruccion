begin;
-- Avisos durables: también detectan una modificación que nunca terminó de sincronizar.
create table public.order_modification_notices (
 id uuid primary key, order_id uuid not null references public.orders(id) on delete cascade,
 original_code text not null, code text not null, new_codes text[] not null default '{}',
 details jsonb not null default '{}', results jsonb not null default '{}', failures jsonb not null default '[]',
 notify_requested boolean not null default false, state text not null default 'processing' check(state in ('processing','ready')),
 ticket_id uuid references public.support_tickets(id), telegram_error text not null default '',
 sent_at timestamptz, message_id bigint, lease uuid, lease_until timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), finished_at timestamptz
);
alter table public.order_modification_notices enable row level security;
revoke all on public.order_modification_notices from public,anon,authenticated;
grant all on public.order_modification_notices to service_role;
create index order_modification_notices_pending on public.order_modification_notices(created_at) where sent_at is null;

create function public.capture_order_modification_notice() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.modified_data->>'sync_monitor' is distinct from 'true' or not (new.modified_data ? 'items') or exists(select 1 from orders o where o.id=new.order_id
 and o.channel='mayorista' and o.seller_id<>'3820a0fe-bb0a-4a84-ad85-79e49868cad7') then return new;end if;
 insert into order_modification_notices(id,order_id,original_code,code,details)
 values(new.id,new.order_id,coalesce(new.original_data->>'legacy_code',''),coalesce(new.modified_data->>'legacy_code',''),
 jsonb_build_object('clientName',new.modified_data->>'customer_name','sellerName',new.changed_by_name)) on conflict do nothing;
 return new;
end$$;
create trigger capture_order_modification_notice after insert on public.order_history for each row execute function public.capture_order_modification_notice();

create function public.start_order_modification_notice(p_id uuid,p_order uuid,p_code text,p_details jsonb,p_notify boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into order_modification_notices(id,order_id,original_code,code,details,notify_requested)
 values(p_id,p_order,p_code,p_code,p_details,p_notify)
 on conflict(id) do update set details=order_modification_notices.details||excluded.details,
 notify_requested=order_modification_notices.notify_requested or excluded.notify_requested
 where order_modification_notices.order_id=excluded.order_id and order_modification_notices.state='processing';
 if not exists(select 1 from order_modification_notices where id=p_id and order_id=p_order) then raise exception 'La modificación no corresponde al pedido';end if;
end$$;

create function public.finish_order_modification_notice(p_id uuid,p_code text,p_results jsonb,p_failures jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update order_modification_notices n set code=p_code,results=p_results,failures=p_failures,state='ready',finished_at=now(),
 new_codes=array(select trim(c) from regexp_split_to_table(p_code,'[/,]') c where trim(c)<>'' and
 trim(c)<>all(regexp_split_to_array(trim(n.original_code),'\s*[/,]\s*')))
 where id=p_id and state='processing';
end$$;

create function public.claim_order_modification_notice(p_id uuid default null)
returns setof public.order_modification_notices language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update order_modification_notices n set state='ready',finished_at=now(),code=coalesce(o.legacy_code,n.code),
 failures='["La modificación no confirmó su sincronización. Revisar ERP y planillas antes de entregar."]'::jsonb,
 new_codes=array(select trim(c) from regexp_split_to_table(coalesce(o.legacy_code,n.code),'[/,]') c where trim(c)<>'' and
 trim(c)<>all(regexp_split_to_array(trim(n.original_code),'\s*[/,]\s*')))
 from orders o where o.id=n.order_id and n.state='processing' and n.created_at<now()-interval '5 minutes';
 return query update order_modification_notices set lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1
 where id=(select n.id from order_modification_notices n where n.state='ready' and n.sent_at is null
 and (p_id is null or n.id=p_id) and (n.lease_until is null or n.lease_until<now())
 and (n.notify_requested or cardinality(n.new_codes)>0 or n.failures<>'[]'::jsonb or n.telegram_error<>'')
 order by n.created_at for update skip locked limit 1) returning *;
end$$;

create function public.prepare_order_modification_ticket(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n order_modification_notices;recipient uuid;sector uuid;previous_claim text;result jsonb;ticket_number bigint;
begin
 select * into n from order_modification_notices where id=p_id for update;
 if not found then raise exception 'No se encontró la modificación';end if;
 if n.ticket_id is null and (n.failures<>'[]'::jsonb or n.telegram_error<>'') then
  select p.user_id into recipient from support_profiles p join support_admins a on a.user_id=p.user_id and a.active
  where p.seller_id='381df0d1-183f-4ccb-aaf2-8147c76159a9' and support_user_active(p.user_id);
  select id into sector from support_sectors where active and name='TI / Sistemas';
  if recipient is null or sector is null then raise exception 'Configurar a Diego y el sector TI / Sistemas para revisar modificaciones';end if;
  previous_claim=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',recipient::text,true);
  result=support_command('create',null,n.id,null,jsonb_build_object('responsibility_kind','person','assignee_id',recipient,'sector_id',sector,
   'title',left('Revisar modificación de pedido · '||n.code,160),'description',left('Modificación automática con errores. Pedido: '||n.code||E'\nCliente: '||coalesce(n.details->>'clientName','')||E'\nFallos: '||n.failures::text||E'\nTelegram: '||n.telegram_error||E'\nResultados: '||n.results::text,10000),
   'module','Pedidos / sincronización de planillas','type','error','suggested_priority','high','impact','Riesgo de preparar o entregar productos distintos a los vendidos.',
   'expected','Verificar productos, códigos hermanos e importes en ERP, vendedora, Central y Entregas Actual antes de cerrar el ticket.'));
  perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
  update order_modification_notices set ticket_id=(result->>'id')::uuid where id=n.id returning * into n;
 end if;
 select number into ticket_number from support_tickets where id=n.ticket_id;
 return to_jsonb(n)||jsonb_build_object('ticket_number',ticket_number);
end$$;

create function public.complete_order_modification_notice(p_id uuid,p_lease uuid,p_sent boolean,p_error text,p_message bigint default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update order_modification_notices set sent_at=case when p_sent then now() else null end,
 message_id=case when p_sent then p_message else message_id end,telegram_error=case when p_sent then telegram_error else left(p_error,2000) end,
 lease=null,lease_until=case when p_sent then null else now()+interval '1 minute' end
 where id=p_id and lease=p_lease;
 if not found then raise exception 'El aviso cambió de propietario';end if;
end$$;

revoke all on function public.capture_order_modification_notice() from public,anon,authenticated;
revoke all on function public.start_order_modification_notice(uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.finish_order_modification_notice(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.claim_order_modification_notice(uuid) from public,anon,authenticated;
revoke all on function public.prepare_order_modification_ticket(uuid) from public,anon,authenticated;
revoke all on function public.complete_order_modification_notice(uuid,uuid,boolean,text,bigint) from public,anon,authenticated;
grant execute on function public.start_order_modification_notice(uuid,uuid,text,jsonb,boolean),
 public.finish_order_modification_notice(uuid,text,jsonb,jsonb),public.claim_order_modification_notice(uuid),
 public.prepare_order_modification_ticket(uuid),public.complete_order_modification_notice(uuid,uuid,boolean,text,bigint) to service_role;
notify pgrst,'reload schema';
commit;
