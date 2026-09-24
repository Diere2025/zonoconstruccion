begin;

alter table public.order_sync_jobs drop constraint if exists order_sync_jobs_kind_check;
alter table public.order_sync_jobs add constraint order_sync_jobs_kind_check
  check (kind in ('create', 'cancel', 'reactivate'));

create or replace function public.capture_order_cancellation_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kind text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'Cancelado' then
    v_kind := 'cancel';
  elsif old.status in ('Cancelado', 'Anulado') and new.status not in ('Cancelado', 'Anulado') then
    v_kind := 'reactivate';
  else
    return new;
  end if;

  insert into public.order_sync_jobs(order_id,seller_id,submitted_by,customer_name,code,kind,status,payload)
  values(new.id,coalesce(new.seller_id,'00000000-0000-0000-0000-000000000000'::uuid),
    auth.uid(),coalesce(new.customer_name,'Cliente'),new.legacy_code,v_kind,'pending',
    case when v_kind = 'cancel'
      then jsonb_build_object('reason',coalesce(nullif(new.cancel_reason,''),'Anulado desde ERP'))
      else '{}'::jsonb end)
  on conflict(order_id,kind) do update set status='pending', payload=excluded.payload,
    code=excluded.code, read_at=null, started_at=null, finished_at=null, message=null, result=null;
  begin
    perform public.dispatch_order_sync();
  exception when others then
    raise warning 'Immediate order status dispatch failed; scheduled worker will resume';
  end;
  return new;
end $$;

create or replace function public.reactivate_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order public.orders;
  v_item record;
  v_reserved numeric;
  v_original_status text;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'Sesión requerida'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.seller_id is distinct from v_caller and not exists (
    select 1 from public.sellers where id=v_caller and role='admin'
  ) then raise exception 'Sin permiso para reactivar este pedido'; end if;
  if v_order.status not in ('Cancelado','Anulado') then
    raise exception 'El pedido ya no está anulado';
  end if;
  if v_order.channel is distinct from 'mayorista' and nullif(trim(v_order.legacy_code),'') is null then
    raise exception 'El pedido no tiene código de planilla. Revisá su sincronización antes de reactivarlo';
  end if;
  v_original_status := v_order.status;

  -- A failed delivery may have left automatic Entrega movements behind.
  if exists (select 1 from public.inventory_transactions
    where reference_id=p_order_id and type='Entrega') then
    if exists (select 1 from public.deliveries where order_id=p_order_id
      and (status='entregado' or real_delivery_date is not null or carrier_id is not null
        or route_sheet_id is not null)) then
      raise exception 'El pedido tiene una entrega ejecutada o asignada. Revisá stock y ruteo antes de reactivarlo';
    end if;
    delete from public.inventory_transactions where reference_id=p_order_id and type='Entrega';
  end if;

  -- Reconcile both missing and obsolete reservations, including edited products.
  for v_item in
    with desired as (
      select product_id, sum(quantity)::numeric as quantity
        from public.order_items where order_id=p_order_id and product_id is not null
        group by product_id
    ), ledger as (
      select product_id, sum(case when type='Reserva Pedido' then quantity
        when type='Cancelacion Pedido' then -quantity else 0 end)::numeric as reserved
        from public.inventory_transactions where reference_id=p_order_id
          and type in ('Reserva Pedido','Cancelacion Pedido') group by product_id
    )
    select coalesce(d.product_id,l.product_id) as product_id,
      coalesce(d.quantity,0) as quantity,coalesce(l.reserved,0) as reserved
      from desired d full join ledger l using(product_id)
  loop
    v_reserved := v_item.reserved;
    if v_reserved < v_item.quantity then
      insert into public.inventory_transactions(product_id,quantity,type,reference_id,user_id)
      values(v_item.product_id,v_item.quantity-v_reserved,'Reserva Pedido',p_order_id,v_caller);
    elsif v_reserved > v_item.quantity then
      insert into public.inventory_transactions(product_id,quantity,type,reference_id,user_id)
      values(v_item.product_id,v_reserved-v_item.quantity,'Cancelacion Pedido',p_order_id,v_caller);
    end if;
  end loop;

  update public.orders set status='Pendiente',cancel_reason=null
    where id=p_order_id returning * into v_order;
  insert into public.order_history(order_id,changed_by_id,changed_by_name,
    change_reason,original_data,modified_data,changed_at)
  values(p_order_id,v_caller,coalesce((select full_name from public.sellers where id=v_caller),'Vendedor'),
    'Reactivación de pedido',jsonb_build_object('status',v_original_status),
    jsonb_build_object('status','Pendiente'),now());
  return v_order;
end $$;
revoke all on function public.reactivate_order(uuid) from public,anon;
grant execute on function public.reactivate_order(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
