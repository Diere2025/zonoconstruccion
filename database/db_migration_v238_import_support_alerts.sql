begin;
create table if not exists public.support_import_alerts (
 fingerprint text primary key,ticket_id uuid not null references public.support_tickets(id),
 occurrences integer not null default 1,first_seen timestamptz not null default now(),last_seen timestamptz not null default now(),
 first_details jsonb not null,last_details jsonb not null
);
alter table public.support_import_alerts enable row level security;
revoke all on public.support_import_alerts from public,anon,authenticated;
grant all on public.support_import_alerts to service_role;
create or replace function public.support_report_import_alert(p_actor uuid,p_details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;area uuid;v_fingerprint text;existing public.support_import_alerts%rowtype;t public.support_tickets%rowtype;r jsonb;body text;old_actor text:=current_setting('request.jwt.claim.sub',true);
begin
 if jsonb_typeof(p_details)<>'object' or length(trim(coalesce(p_details->>'warning','')))<3 or length(p_details::text)>20000 then raise exception 'SUPPORT_INVALID';end if;
 actor:=p_actor;
 if actor is null then select a.user_id into actor from public.support_admins a where a.active and public.support_user_active(a.user_id) order by (a.user_id='381df0d1-183f-4ccb-aaf2-8147c76159a9') desc,a.user_id limit 1;
 elsif not public.support_user_active(actor) then raise exception 'SUPPORT_FORBIDDEN';end if;
 if actor is null then raise exception 'SUPPORT_FORBIDDEN';end if;
 select id into area from public.support_sectors where active and lower(trim(name))='ti / sistemas';if area is null then raise exception 'SUPPORT_AREA_EMPTY';end if;
 -- Same lock order as support_command; dedup and ticket creation commit together.
 perform pg_advisory_xact_lock(106106);
 v_fingerprint:=md5(jsonb_build_array(coalesce(nullif(p_details->>'code',''),p_details->>'source'),p_details->>'warning')::text);
 select * into existing from public.support_import_alerts a where a.fingerprint=v_fingerprint for update;
 if found then
  select * into t from public.support_tickets where id=existing.ticket_id;
  if t.status not in ('closed','cancelled') then
   update public.support_import_alerts a set occurrences=a.occurrences+1,last_seen=clock_timestamp(),last_details=p_details where a.fingerprint=v_fingerprint;
   return jsonb_build_object('id',t.id,'number',t.number::text,'reused',true);
  end if;
 end if;
 body:='Aviso automático de importación para revisión de TI.'||E'\nOrigen: '||coalesce(p_details->>'source','Importación')||
 E'\nPlanilla: '||coalesce(nullif(p_details->>'sourceUrl',''),'No informada')||E'\nLote: '||coalesce(p_details->>'batch','')||E'\nEjecución: '||coalesce(p_details->>'runId','')||
 E'\nOperador: '||case when p_actor is null then 'Proceso sin sesión identificada; aviso registrado por la cuenta administradora del sistema.' else actor::text end||
 E'\nAviso: '||left(p_details->>'warning',2000)||E'\nCódigos del lote: '||coalesce(p_details->'codes','[]')::text||
 E'\nFilas del lote (código/estado): '||coalesce(p_details->'rows','[]')::text||E'\nOpciones: '||coalesce(p_details->'options','{}')::text||E'\nPedido ERP: '||coalesce(p_details->'order','null')::text||
 E'\nRevisión sugerida: comparar todos los códigos del pedido y sus líneas entre la planilla de origen, Central, Entregas Actual y el ERP. Verificar artículos, importes y estado antes de corregir. Una fila parcial conserva el detalle e importes del ERP; este aviso no modifica pedidos ni aplica correcciones automáticas.';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 r:=public.support_command('create',null,gen_random_uuid(),null,jsonb_build_object('responsibility_kind','area','sector_id',area,'title',left('[Importación] '||coalesce(nullif(p_details->>'code','')||' · ','')||coalesce(p_details->>'kind','Advertencia'),160),'description',left(body,10000),'module','Importación de pedidos','type','error','suggested_priority','medium','expected','La importación conserva los datos completos del pedido y deja trazabilidad de las advertencias para Soporte TI.','actual',left(p_details->>'warning',2000)));
 perform set_config('request.jwt.claim.sub',coalesce(old_actor,''),true);
 select * into t from public.support_tickets where id=(r->>'id')::uuid;
 insert into public.support_import_alerts as a(fingerprint,ticket_id,first_details,last_details) values(v_fingerprint,t.id,p_details,p_details)
 on conflict on constraint support_import_alerts_pkey do update set ticket_id=excluded.ticket_id,occurrences=1,first_seen=now(),last_seen=now(),first_details=excluded.first_details,last_details=excluded.last_details;
 return jsonb_build_object('id',t.id,'number',t.number::text,'reused',false);
end;$$;
revoke all on function public.support_report_import_alert(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.support_report_import_alert(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
