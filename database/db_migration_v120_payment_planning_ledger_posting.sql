begin;

-- A realization and its Movimiento must either both exist or both roll back.
create or replace function public.payment_planning_realize_with_movement(
  p_actor uuid, p_key uuid, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_roles text[];
  v_prior public.payment_planning_requests%rowtype;
  v_item public.payment_planning_items%rowtype;
  v_account public.financial_accounts%rowtype;
  v_concept public.financial_concepts%rowtype;
  v_fund uuid;
  v_fund_kind text;
  v_payment_method uuid;
  v_amount numeric(15,2);
  v_date date;
  v_detail text;
  v_notes text;
  v_realization jsonb;
  v_transaction uuid;
  v_result jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Datos inválidos.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_key::text, 0));
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
  select * into v_prior from public.payment_planning_requests where actor_id=p_actor and request_key=p_key;
  if found then
    if v_prior.action <> 'realize_with_movement' or v_prior.payload <> p_payload then
      raise exception 'Clave de solicitud reutilizada con otros datos.';
    end if;
    return v_prior.result;
  end if;

  select * into v_item from public.payment_planning_items
  where id=(p_payload->>'item_id')::uuid for update;
  if not found or v_item.status <> 'active' then raise exception 'El ítem no admite realizaciones.'; end if;
  v_amount := (p_payload->>'amount')::numeric;
  if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount,2) then
    raise exception 'El importe debe ser positivo y tener hasta dos decimales.';
  end if;
  v_date := (p_payload->>'effective_date')::date;
  if v_date is null then raise exception 'Indicá la fecha del movimiento.'; end if;
  v_detail := trim(coalesce(p_payload->>'movement_detail',''));
  if length(v_detail) < 2 or length(v_detail) > 240 then raise exception 'Indicá el detalle del movimiento.'; end if;
  v_notes := trim(coalesce(p_payload->>'notes',''));

  select * into v_account from public.financial_accounts
  where id=(p_payload->>'financial_account_id')::uuid and is_active for update;
  if not found then raise exception 'La caja de Movimientos no está disponible.'; end if;
  if v_account.currency <> (select currency from public.payment_planning_funds where id=v_item.fund_id) then
    raise exception 'La caja de Movimientos debe tener la misma moneda que el pago planificado.';
  end if;
  v_fund_kind := case
    when v_account.type='efectivo' then 'cash'
    when lower(v_account.name) like 'cuenta mp3%' or lower(v_account.name) like 'cuenta mp4%'
      or lower(v_account.name) like 'cuenta mp5%' then 'personal'
    else 'company' end;
  select id into v_fund from public.payment_planning_funds
  where kind=v_fund_kind and currency=v_account.currency and active order by id limit 1;
  if v_fund is null then raise exception 'La caja no tiene un fondo de planificación compatible.'; end if;

  select * into v_concept from public.financial_concepts
  where id=(p_payload->>'financial_concept_id')::uuid and is_active;
  if not found or v_concept.movement_type not in (
    'Mov. Financiero', case when v_item.kind='expense' then 'Egreso' else 'Ingreso' end
  ) then raise exception 'Elegí un concepto del mismo tipo que el pago o ingreso.'; end if;
  select id into v_payment_method from public.payment_methods
  where name = case when v_account.type='efectivo' then 'Efectivo' else 'Transferencia' end
  order by id limit 1;
  if v_payment_method is null then raise exception 'No existe un medio de pago activo para esa caja.'; end if;

  v_realization := public.payment_planning_mutate(p_actor, gen_random_uuid(), 'realize',
    jsonb_build_object('item_id',v_item.id,'amount',v_amount,'effective_date',v_date,
      'fund_id',v_fund,'notes',v_notes));
  insert into public.cash_transactions(
    type,category,sub_category,efe_category,financial_concept_id,business_unit,
    amount,currency,payment_method_id,financial_account_id,concept,notes,created_by,created_at
  ) values (
    case when v_item.kind='expense' then 'egreso' else 'ingreso' end,
    v_concept.category,nullif(v_concept.sub_category,''),nullif(v_concept.efe_category,''),
    v_concept.id,'ZONO',v_amount,v_account.currency,v_payment_method,v_account.id,
    v_detail,nullif(v_notes,''),p_actor,
    make_timestamptz(extract(year from v_date)::int,extract(month from v_date)::int,
      extract(day from v_date)::int,12,0,0,'America/Argentina/Buenos_Aires')
  ) returning id into v_transaction;
  update public.payment_planning_realizations
  set cash_transaction_id=v_transaction where id=(v_realization->>'id')::uuid;
  v_result := jsonb_build_object('realization_id',v_realization->>'id',
    'cash_transaction_id',v_transaction,'financial_account_id',v_account.id);
  insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
  values ('realization',(v_realization->>'id')::uuid,'link_cash_transaction',v_result,p_actor);
  insert into public.payment_planning_requests(actor_id,request_key,action,payload,result)
  values (p_actor,p_key,'realize_with_movement',p_payload,v_result);
  return v_result;
end;
$$;

revoke all on function public.payment_planning_realize_with_movement(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.payment_planning_realize_with_movement(uuid,uuid,jsonb) to service_role;

commit;
