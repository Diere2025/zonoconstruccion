begin;

create or replace function public.payment_planning_reconcile(p_actor uuid,p_key uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_roles text[];
  v_prior payment_planning_requests%rowtype;
  v_item payment_planning_items%rowtype;
  v_transaction cash_transactions%rowtype;
  v_realization payment_planning_realizations%rowtype;
  v_account financial_accounts%rowtype;
  v_id uuid;
  v_fund uuid;
  v_kind text;
  v_date date;
  v_created jsonb;
  v_result jsonb := '[]'::jsonb;
  v_required numeric;
  v_before_item jsonb;
  v_mode text := p_payload->>'mode';
begin
  select array_remove(array_agg(distinct r),null) into v_roles
  from sellers s,lateral unnest(array_append(coalesce(s.roles,'{}'::text[]),s.role)) r
  where (s.id=p_actor or (
    not exists(select 1 from sellers d where d.id=p_actor)
    and lower(s.email)=(select lower(email) from auth.users where id=p_actor)
    and (select count(*) from sellers e where lower(e.email)=(select lower(email) from auth.users where id=p_actor))=1
  )) and s.is_active is distinct from false;
  if not 'admin'=any(coalesce(v_roles,'{}'::text[])) then raise exception 'Sin permiso de planificación.' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Datos inválidos.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
  select * into v_prior from payment_planning_requests where actor_id=p_actor and request_key=p_key;
  if found then
    if v_prior.action<>'reconcile' or v_prior.payload<>p_payload then raise exception 'Clave reutilizada con otros datos.'; end if;
    return v_prior.result;
  end if;
  select * into v_item from payment_planning_items where id=(p_payload->>'item_id')::uuid for update;
  if not found then raise exception 'Pago inexistente.'; end if;
  if v_mode='unlink' then
    select * into v_realization from payment_planning_realizations
      where id=(p_payload->>'realization_id')::uuid and item_id=v_item.id and reversed_at is null for update;
    if not found or v_realization.cash_transaction_id is null then raise exception 'El pago no tiene un vínculo activo.'; end if;
    update payment_planning_realizations set cash_transaction_id=null where id=v_realization.id;
    update payment_planning_source_rows set match_status='review',realization_id=null,cash_transaction_id=null
      where realization_id=v_realization.id and match_status='confirmed';
    v_result := jsonb_build_object('realization_id',v_realization.id,'cash_transaction_id',v_realization.cash_transaction_id);
    insert into payment_planning_events(entity_type,entity_id,action,before_value,reason,actor_id)
      values('realization',v_realization.id,'unlink_cash_transaction',v_result,'Vínculo deshecho; pago y Movimiento conservados',p_actor);
    update payment_planning_items set version=version+1,updated_at=now() where id=v_item.id;
  elsif v_mode='create' then
    perform payment_planning_allocate_reconciliation(p_actor,v_item.id,(p_payload->>'amount')::numeric);
    v_created := payment_planning_realize_with_movement(p_actor,gen_random_uuid(),p_payload||jsonb_build_object('item_id',v_item.id));
    v_result := jsonb_build_array(v_created);
  elsif v_mode='existing' then
    if jsonb_typeof(p_payload->'transaction_ids') is distinct from 'array'
      or jsonb_array_length(p_payload->'transaction_ids') not between 1 and 50 then raise exception 'Seleccioná entre 1 y 50 Movimientos.'; end if;
    if coalesce((p_payload->>'adjust_amount')::boolean,false) then
      if v_item.amount is null or v_item.status<>'active' then raise exception 'El pago no admite ajustes.';end if;
      if v_item.amount is distinct from (p_payload->>'expected_amount')::numeric then raise exception 'El importe cambió en otra sesión. Revisá la diferencia.' using errcode='40001';end if;
      select coalesce(sum(t.amount),0) into v_required from cash_transactions t
        where t.id in (select value::uuid from jsonb_array_elements_text(p_payload->'transaction_ids'));
      select v_required+coalesce(sum(amount),0)+v_item.closed_amount into v_required from payment_planning_realizations where item_id=v_item.id and reversed_at is null and cash_transaction_id is not null;
      if v_required>v_item.amount then
        v_before_item:=to_jsonb(v_item);
        update payment_planning_items set amount=v_required,version=version+1,updated_at=now() where id=v_item.id returning * into v_item;
        insert into payment_planning_events(entity_type,entity_id,action,before_value,after_value,reason,actor_id)
          values('item',v_item.id,'adjust_reconciliation_amount',v_before_item,to_jsonb(v_item),'Diferencia confirmada al conciliar con Movimientos',p_actor);
      end if;
    end if;
    -- Deterministic lock order prevents overlapping batches from deadlocking.
    for v_id in select value::uuid from jsonb_array_elements_text(p_payload->'transaction_ids') order by value
    loop
      select * into v_transaction from cash_transactions where id=v_id for update;
      if not found then raise exception 'Movimiento inexistente.'; end if;
      if exists(select 1 from payment_planning_realizations where cash_transaction_id=v_id) then raise exception 'El Movimiento ya está asociado a otro pago.'; end if;
      if v_transaction.type<>(case when v_item.kind='expense' then 'egreso' else 'ingreso' end)
        or v_transaction.currency<>(select currency from payment_planning_funds where id=v_item.fund_id)
        or v_transaction.amount<=0 then raise exception 'El tipo, moneda o importe del Movimiento no coincide.'; end if;
      select * into v_account from financial_accounts where id=v_transaction.financial_account_id;
      if not found or v_account.currency<>v_transaction.currency then raise exception 'El Movimiento no tiene una caja compatible.'; end if;
      v_kind := case when v_account.type='efectivo' then 'cash'
        when lower(v_account.name) like 'cuenta mp3%' or lower(v_account.name) like 'cuenta mp4%' or lower(v_account.name) like 'cuenta mp5%' then 'personal' else 'company' end;
      select id into v_fund from payment_planning_funds where kind=v_kind and currency=v_transaction.currency and active order by id limit 1;
      if v_fund is null then raise exception 'La caja no tiene un fondo compatible.'; end if;
      v_date := (v_transaction.created_at at time zone 'America/Argentina/Buenos_Aires')::date;
      perform payment_planning_allocate_reconciliation(p_actor,v_item.id,v_transaction.amount);
      v_created := payment_planning_mutate(p_actor,gen_random_uuid(),'realize',jsonb_build_object(
        'item_id',v_item.id,'amount',v_transaction.amount,'effective_date',v_date,'fund_id',v_fund,'notes','Conciliado con Movimiento existente'));
      update payment_planning_realizations set cash_transaction_id=v_id,created_at=v_transaction.created_at where id=(v_created->>'id')::uuid;
      v_result := v_result||jsonb_build_array(jsonb_build_object('realization_id',v_created->>'id','cash_transaction_id',v_id));
    end loop;
  else raise exception 'Acción de conciliación inválida.';
  end if;
  insert into payment_planning_events(entity_type,entity_id,action,after_value,reason,actor_id)
    values('item',v_item.id,'reconcile',v_result,v_mode,p_actor);
  insert into payment_planning_requests(actor_id,request_key,action,payload,result)
    values(p_actor,p_key,'reconcile',p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.payment_planning_reconcile(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.payment_planning_reconcile(uuid,uuid,jsonb) to service_role;
commit;
