begin;
-- Supplemental service concepts belong to their original LOG, not the day they are paid.
create or replace function public.save_logistics_dispatch_extras(p_actor uuid,p_dispatch uuid,p_version integer,p_extras jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous logistics_dispatch_plans%rowtype; saved logistics_dispatch_plans%rowtype; e jsonb; amount numeric;
begin
 if not coalesce(public.can_plan_logistics(p_actor),false) then raise exception 'Sin permiso para registrar extras de logística' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into previous from logistics_dispatch_plans where dispatch_id=p_dispatch for update;
 if not found or previous.status='cancelled' then raise exception 'Salida inexistente o no realizada';end if;
 if previous.version is distinct from p_version then raise exception 'La salida cambió. Actualizá.' using errcode='40001';end if;
 if jsonb_typeof(p_extras) is distinct from 'array' or jsonb_array_length(p_extras)>20 then raise exception 'Extras inválidos';end if;
 if (select count(distinct j->>'id') from jsonb_array_elements(p_extras) j)<>jsonb_array_length(p_extras) then raise exception 'Extra repetido';end if;
 for e in select value from jsonb_array_elements(p_extras) loop
  if coalesce(e->>'id','')!~'^[0-9a-fA-F-]{36}$' or coalesce(e->>'kind','') not in ('pickup','errand','parcel','waiting','km_adjustment','other')
   or length(trim(coalesce(e->>'label',''))) not between 1 and 300 or length(trim(coalesce(e->>'reference',''))) not between 1 and 500 then raise exception 'Cada extra requiere tipo, motivo y referencia';end if;
  amount=(e->>'amount')::numeric;
  if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2) then raise exception 'Importe inválido';end if;
  if e->>'kind'='km_adjustment' and (coalesce((e->>'km')::numeric,0)<=0 or coalesce((e->>'unitPrice')::numeric,0)<=0 or amount is distinct from round((e->>'km')::numeric*(e->>'unitPrice')::numeric,2)) then raise exception 'El ajuste no coincide con km por tarifa';end if;
  if e->>'runNumber' is not null and not exists(select 1 from jsonb_array_elements(previous.planned->'loads') l where l->>'runNumber'=e->>'runNumber') then raise exception 'La carga no pertenece al LOG';end if;
 end loop;
 update logistics_dispatch_plans set actual=jsonb_set(actual,'{extras}',p_extras),version=version+1,updated_by=p_actor,updated_at=now() where dispatch_id=p_dispatch returning * into saved;
 insert into logistics_dispatch_plan_events(dispatch_id,actor_id,previous_version,data) values(p_dispatch,p_actor,previous.version,jsonb_build_object('action','service_extras','previousExtras',coalesce(previous.actual->'extras','[]'::jsonb),'extras',p_extras,'version',saved.version));
 return jsonb_build_object('dispatchId',p_dispatch,'version',saved.version);
end;$$;
revoke all on function public.save_logistics_dispatch_extras(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_logistics_dispatch_extras(uuid,uuid,integer,jsonb) to service_role;
commit;
