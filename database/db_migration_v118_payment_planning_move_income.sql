begin;

-- Extend the audited move operation to planned income as well as payments.
-- Recorded realizations keep their original effective date and fund.
create or replace function public.payment_planning_move_item(
  p_actor uuid, p_key uuid, p_payload jsonb
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_roles text[];
  v_prior public.payment_planning_requests%rowtype;
  v_item public.payment_planning_items%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_fund public.payment_planning_funds%rowtype;
  v_target public.payment_planning_funds%rowtype;
  v_date date;
  v_realized numeric(15,2);
begin
  select array_remove(array_agg(distinct lower(r)),null) into v_roles
  from public.sellers s, lateral unnest(array_append(coalesce(s.roles,'{}'::text[]),s.role)) r
  where (s.id=p_actor or (
    not exists (select 1 from public.sellers direct_match where direct_match.id=p_actor)
    and lower(s.email)=(select lower(email) from auth.users where id=p_actor)
    and (select count(*) from public.sellers email_match where lower(email_match.email)=(select lower(email) from auth.users where id=p_actor))=1
  )) and s.is_active is distinct from false;
  if not 'admin'=any(coalesce(v_roles,'{}'::text[])) then
    raise exception 'Sin permiso de planificación.' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Datos inválidos.'; end if;
  select * into v_prior from public.payment_planning_requests where actor_id=p_actor and request_key=p_key;
  if found then
    if v_prior.action <> 'move_item' or v_prior.payload <> p_payload then
      raise exception 'Clave de solicitud reutilizada con otros datos.';
    end if;
    return v_prior.result;
  end if;

  select * into v_item from public.payment_planning_items
    where id=(p_payload->>'id')::uuid for update;
  if not found or v_item.status <> 'active' then
    raise exception 'El movimiento no admite reprogramación.';
  end if;
  if v_item.version <> (p_payload->>'version')::integer then
    raise exception 'El movimiento cambió en otra sesión. Actualizá la vista.' using errcode='40001';
  end if;
  select coalesce(sum(amount),0) into v_realized
    from public.payment_planning_realizations where item_id=v_item.id and reversed_at is null;
  if v_item.amount is null or v_item.amount <= v_realized + v_item.closed_amount then
    raise exception 'El movimiento no tiene importe pendiente para mover.';
  end if;
  v_date := (p_payload->>'scheduled_date')::date;
  if v_date is null or v_date < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Elegí una fecha desde hoy en adelante.';
  end if;
  select * into v_fund from public.payment_planning_funds where id=v_item.fund_id;
  select * into v_target from public.payment_planning_funds
    where id=(p_payload->>'fund_id')::uuid and active for share;
  if not found or v_target.currency <> v_fund.currency then
    raise exception 'La caja de destino debe estar activa y usar la misma moneda.';
  end if;
  if v_target.id <> v_item.fund_id and exists (
    select 1 from public.payment_planning_reservations
    where target_item_id=v_item.id and reversed_at is null
  ) then
    raise exception 'Este pago tiene una reserva asignada. Liberala antes de cambiarlo de caja.';
  end if;
  v_before := to_jsonb(v_item);
  if v_item.scheduled_date is distinct from v_date or v_item.fund_id <> v_target.id then
    update public.payment_planning_items
      set scheduled_date=v_date, fund_id=v_target.id, version=version+1, updated_at=now()
      where id=v_item.id returning * into v_item;
    insert into public.payment_planning_events(
      entity_type,entity_id,action,before_value,after_value,reason,actor_id
    ) values (
      'item',v_item.id,'move_item',v_before,to_jsonb(v_item),
      nullif(trim(p_payload->>'reason'),''),p_actor
    );
  end if;
  v_result := to_jsonb(v_item);
  insert into public.payment_planning_requests(actor_id,request_key,action,payload,result)
    values (p_actor,p_key,'move_item',p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.payment_planning_move_item(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.payment_planning_move_item(uuid,uuid,jsonb) to service_role;

commit;
