-- Separate logistics workflow; the existing ticket ACL, uploads and notifications remain authoritative.
alter table public.support_sectors add column shipping_enabled boolean not null default false;
update public.support_sectors set shipping_enabled=true where lower(trim(name))='logística';
create unique index support_shipping_sector on public.support_sectors(shipping_enabled) where shipping_enabled;
alter table public.support_tickets
  add column workflow text not null default 'incident' check(workflow in ('incident','shipping')),
  add column shipping_request jsonb,
  add column shipping_quotes jsonb not null default '[]' check(jsonb_typeof(shipping_quotes)='array'),
  add column shipping_selected integer,
  add constraint support_shipping_data check((workflow='incident' and shipping_request is null) or (workflow='shipping' and jsonb_typeof(shipping_request)='object'));
create index support_shipping_inbox on public.support_tickets(workflow,sector_id,status,updated_at desc,id desc);

-- Preserve the installed, tested implementation as a private helper, including local fixes.
do $$ begin
  execute replace(replace(replace(replace(pg_get_functiondef('public.support_command(text,uuid,uuid,integer,jsonb)'::regprocedure),
    'FUNCTION public.support_command(', 'FUNCTION public.support_command_core('),
    'jsonb_build_object(''id'',t.id,''version'',t.version)', 'jsonb_build_object(''id'',t.id,''version'',t.version,''event_id'',ev)'),
    'and not manager then raise exception ''SUPPORT_FORBIDDEN'';', 'and not manager and not (t.workflow=''shipping'' and p_command=''cancel'' and creator) then raise exception ''SUPPORT_FORBIDDEN'';'),
    'if p_command in (''cancel'',''close_admin'',''restore'') and not administrator then',
    'if p_command in (''cancel'',''close_admin'',''restore'') and not administrator and not (t.workflow=''shipping'' and ((p_command=''cancel'' and (manager or creator)) or (p_command=''close_admin'' and manager))) then');
end $$;
revoke all on function public.support_command_core(text,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;

create or replace function public.support_command(p_command text,p_ticket uuid,p_key uuid,p_version integer,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); t public.support_tickets%rowtype; op public.support_operations%rowtype;
 req jsonb:=jsonb_build_object('command',p_command,'ticket',p_ticket,'version',p_version,'data',p_data);
 cmd text:=p_command; data jsonb:=p_data; r jsonb; quotes jsonb; q jsonb; sector uuid; field text;
 summary text:=''; selected integer; i integer:=0; event uuid;
begin
 if not public.support_user_active(u) then raise exception 'SUPPORT_FORBIDDEN'; end if;
 if p_key is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'SUPPORT_INVALID'; end if;
 perform pg_advisory_xact_lock(106106);
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_key::text,0));
 select * into op from public.support_operations where user_id=u and key=p_key;
 if found then
   if op.request<>req then raise exception 'SUPPORT_CONFLICT'; end if;
   if op.ticket_id is not null and not public.support_can_read_ticket(op.ticket_id) then raise exception 'SUPPORT_NOT_FOUND'; end if;
   if p_command in ('sector_save','member_save','admin_save') and not public.support_user_admin(u) then raise exception 'SUPPORT_FORBIDDEN'; end if;
   return op.result;
 end if;
 if p_command='create' and coalesce(p_data->>'workflow','incident') not in ('incident','shipping') then raise exception 'SUPPORT_INVALID'; end if;
 if p_command='create' and p_data->>'workflow'='shipping' then
   r:=p_data->'shipping_request';
   if jsonb_typeof(r) is distinct from 'object' then raise exception 'SHIPPING_REQUEST_INVALID'; end if;
   foreach field in array array['locality','province','postal_code','products'] loop
     if jsonb_typeof(r->field) is distinct from 'string' or length(trim(r->>field))<1 then raise exception 'SHIPPING_REQUEST_INVALID'; end if;
   end loop;
   foreach field in array array['locality','province','postal_code','address','customer','reference','products','conditions'] loop
     if r ? field and (jsonb_typeof(r->field) is distinct from 'string' or length(r->>field)>case when field in ('products','conditions') then 3000 else 250 end) then raise exception 'SHIPPING_REQUEST_INVALID'; end if;
   end loop;
   select id into sector from public.support_sectors where shipping_enabled and active;
   if sector is null then raise exception 'SHIPPING_SECTOR_UNAVAILABLE'; end if;
   summary:=format(E'Destino: %s, %s · CP %s\nDirección: %s\nCliente: %s\nReferencia de presupuesto/pedido: %s\nProductos y cantidades:\n%s\nCondiciones de entrega:\n%s',r->>'locality',r->>'province',r->>'postal_code',coalesce(r->>'address',''),coalesce(r->>'customer',''),coalesce(r->>'reference',''),r->>'products',coalesce(r->>'conditions',''));
   data:=p_data||jsonb_build_object('sector_id',sector,'type','request','module','Cotización de envío','title',left('Envío a '||(r->>'locality')||' · '||(r->>'province'),160),'description',summary,'suggested_priority','medium');
 elsif p_ticket is not null then
   if not public.support_can_read_ticket(p_ticket) then raise exception 'SUPPORT_NOT_FOUND'; end if;
   select * into t from public.support_tickets where id=p_ticket for update;
   if t.workflow='shipping' then
     if p_command in ('request_validation','validate','reject','request_action','transfer') then raise exception 'SUPPORT_INVALID'; end if;
     if p_command='classify' and p_data->>'type' is distinct from 'request' then raise exception 'SUPPORT_INVALID'; end if;
     if p_command='shipping_quote' then
       if not public.support_user_manages(u,t.sector_id) then raise exception 'SUPPORT_FORBIDDEN'; end if;
       quotes:=p_data->'quotes';
       if jsonb_typeof(quotes) is distinct from 'array' then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
       if jsonb_array_length(quotes) not between 1 and 5 then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
       for q in select value from jsonb_array_elements(quotes) loop
         if jsonb_typeof(q) is distinct from 'object' then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
         foreach field in array array['carrier','delivery','valid_until','payment'] loop
           if jsonb_typeof(q->field) is distinct from 'string' or length(trim(q->>field)) not between 1 and 250 then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
         end loop;
         if q ? 'conditions' and (jsonb_typeof(q->'conditions') is distinct from 'string' or length(q->>'conditions')>1000) then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
         if jsonb_typeof(q->'cost') is distinct from 'number' or jsonb_typeof(q->'customer_price') is distinct from 'number' then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
         if (q->>'cost')::numeric not between 0 and 100000000 or (q->>'customer_price')::numeric not between 0 and 100000000
           or (q->>'cost')::numeric<>round((q->>'cost')::numeric,2) or (q->>'customer_price')::numeric<>round((q->>'customer_price')::numeric,2)
           or q->>'payment' not in ('origin','destination') or q->>'valid_until' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
         if (q->>'valid_until')::date < (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'SHIPPING_QUOTE_EXPIRED'; end if;
         i:=i+1;
         summary:=summary||format(E'Opción %s: %s\nCosto transporte: $%s ARS · Importe al cliente: $%s ARS\nPago: %s · Plazo: %s · Vigente hasta: %s\nCondiciones: %s\n\n',i,q->>'carrier',q->>'cost',q->>'customer_price',case q->>'payment' when 'origin' then 'Origen' else 'Destino' end,q->>'delivery',q->>'valid_until',coalesce(q->>'conditions',''));
       end loop;
       cmd:='request_validation'; data:=p_data||jsonb_build_object('solution',summary,'body',summary||'Elegí una opción para finalizar la solicitud o pedí una recotización.');
     elsif p_command='shipping_finish' then
       if jsonb_typeof(p_data->'selected') is distinct from 'number' or (p_data->>'selected') !~ '^\d+$' then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
       selected:=(p_data->>'selected')::integer;
       if selected<0 or selected>=jsonb_array_length(t.shipping_quotes) then raise exception 'SHIPPING_QUOTE_INVALID'; end if;
       q:=t.shipping_quotes->selected;
       if (q->>'valid_until')::date < (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'SHIPPING_QUOTE_EXPIRED'; end if;
       cmd:='validate'; data:=p_data||jsonb_build_object('confirmed',true,'body',format('Opción elegida: %s · Importe al cliente: $%s ARS. Solicitud finalizada.',q->>'carrier',q->>'customer_price'));
     elsif p_command='shipping_requote' then
       cmd:='reject';
     end if;
   elsif p_command in ('shipping_quote','shipping_finish','shipping_requote') then raise exception 'SUPPORT_INVALID'; end if;
 end if;
 r:=public.support_command_core(cmd,p_ticket,p_key,p_version,data);
 event:=nullif(r->>'event_id','')::uuid;
 r:=r-'event_id';
 if p_command='create' and p_data->>'workflow'='shipping' then
   update public.support_tickets set workflow='shipping',shipping_request=p_data->'shipping_request' where id=(r->>'id')::uuid;
 elsif p_command='shipping_quote' then
   update public.support_tickets set shipping_quotes=quotes,shipping_selected=null where id=p_ticket;
 elsif p_command='shipping_finish' then
   update public.support_tickets set shipping_selected=selected where id=p_ticket;
 elsif t.workflow='shipping' and p_command in ('shipping_requote','withdraw','reopen','restore') then
   update public.support_tickets set shipping_selected=null where id=p_ticket;
 end if;
 if t.workflow='shipping' or (p_command='create' and p_data->>'workflow'='shipping') then
   if p_command in ('shipping_quote','shipping_finish','shipping_requote') then
     update public.support_events set kind=p_command,details=details||jsonb_build_object('workflow','shipping','quotes',coalesce(quotes,'[]'),'selected',selected) where id=event;
     update public.support_notifications set kind=p_command where event_id=event;
   end if;
 end if;
 update public.support_operations set request=req,result=r where user_id=u and key=p_key;
 return r;
end $$;
revoke all on function public.support_command(text,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.support_command(text,uuid,uuid,integer,jsonb) to authenticated;
