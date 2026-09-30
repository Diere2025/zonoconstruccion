begin;

-- Save a new item and its realization (and optional Movimiento) atomically.
create or replace function public.payment_planning_create_realized(p_actor uuid, p_key uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_roles text[];
  v_prior public.payment_planning_requests%rowtype;
  v_item jsonb;
  v_realization jsonb;
  v_item_payload jsonb;
  v_realization_payload jsonb;
  v_with_movement boolean;
  v_result jsonb;
begin
  select array_remove(array_agg(distinct r),null) into v_roles
  from public.sellers s, lateral unnest(array_append(coalesce(s.roles,'{}'::text[]),s.role)) r
  where (s.id=p_actor or (
    not exists (select 1 from public.sellers direct_match where direct_match.id=p_actor)
    and lower(s.email)=(select lower(email) from auth.users where id=p_actor)
    and (select count(*) from public.sellers email_match where lower(email_match.email)=(select lower(email) from auth.users where id=p_actor))=1
  )) and s.is_active is distinct from false;
  if not 'admin'=any(coalesce(v_roles,'{}'::text[])) then
    raise exception 'Sin permiso de planificación.' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload->'item') is distinct from 'object'
    or jsonb_typeof(p_payload->'realization') is distinct from 'object' then raise exception 'Datos inválidos.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_key::text, 0));
  select * into v_prior from public.payment_planning_requests where actor_id=p_actor and request_key=p_key;
  if found then
    if v_prior.action <> 'create_realized' or v_prior.payload <> p_payload then raise exception 'Clave de solicitud reutilizada con otros datos.'; end if;
    return v_prior.result;
  end if;
  v_with_movement := coalesce((p_payload->>'with_movement')::boolean,false);
  v_realization_payload := p_payload->'realization';
  if nullif(v_realization_payload->>'effective_date','') is null or nullif(v_realization_payload->>'amount','') is null then
    raise exception 'Indicá fecha e importe de la realización.';
  end if;
  v_item_payload := (p_payload->'item') || jsonb_build_object('amount',v_realization_payload->>'amount',
    'scheduled_date',v_realization_payload->>'effective_date','status','active');
  if not v_with_movement and nullif(v_realization_payload->>'fund_id','') is not null then
    v_item_payload := v_item_payload || jsonb_build_object('fund_id',v_realization_payload->>'fund_id');
  end if;
  v_item := public.payment_planning_mutate(p_actor,gen_random_uuid(),'create_item',v_item_payload);
  v_realization_payload := v_realization_payload || jsonb_build_object('item_id',v_item->>'id');
  if v_with_movement then
    v_realization := public.payment_planning_realize_with_movement(p_actor,gen_random_uuid(),v_realization_payload);
  else
    v_realization := public.payment_planning_mutate(p_actor,gen_random_uuid(),'realize',v_realization_payload);
  end if;
  v_result := jsonb_build_object('item',v_item,'realization',v_realization);
  insert into public.payment_planning_requests(actor_id,request_key,action,payload,result)
  values(p_actor,p_key,'create_realized',p_payload,v_result);
  return v_result;
end;
$$;

revoke all on function public.payment_planning_create_realized(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.payment_planning_create_realized(uuid,uuid,jsonb) to service_role;

commit;
