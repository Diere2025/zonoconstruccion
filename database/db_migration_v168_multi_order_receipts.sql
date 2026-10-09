-- One supplier shipment/remito, multiple orders, one payable. Legacy RPC remains available.
begin;
create table if not exists public.purchase_reception_orders (
  purchase_reception_id uuid not null references public.purchase_receptions(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  primary key(purchase_reception_id,purchase_order_id)
);
create index if not exists purchase_reception_orders_order_idx on public.purchase_reception_orders(purchase_order_id);
alter table public.purchase_reception_orders enable row level security;
drop policy if exists "Read reception order links" on public.purchase_reception_orders;
create policy "Read reception order links" on public.purchase_reception_orders for select to authenticated using(true);
grant select on public.purchase_reception_orders to authenticated;
grant all on public.purchase_reception_orders to service_role;
insert into public.purchase_reception_orders
select id,purchase_order_id from public.purchase_receptions where purchase_order_id is not null
union select i.purchase_reception_id,o.purchase_order_id from public.purchase_reception_items i join public.purchase_order_items o on o.id=i.purchase_order_item_id
on conflict do nothing;

create or replace function public.register_supplier_receipt_multi(
  p_id uuid,p_supplier uuid,p_pos uuid[],p_slip text,p_date date,p_currency text,
  p_stock boolean,p_close boolean,p_notes text,p_items jsonb,p_user uuid
) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_item jsonb; v_line public.purchase_order_items%rowtype; v_qty numeric; v_cost numeric;
  v_product uuid; v_line_id uuid; v_total numeric:=0; v_po public.purchase_orders%rowtype; v_payload jsonb; v_pos uuid[]; v_header_po uuid; v_selected uuid;
begin
  if p_id is null or p_user is null or p_supplier is null or p_date is null or p_stock is null or p_close is null
    or p_currency is null or p_currency not in ('ARS','USD') then raise exception 'Datos de recepción incompletos'; end if;
  if cardinality(p_pos)>20 or array_position(p_pos,null) is not null then raise exception 'Seleccioná hasta 20 OCs válidas'; end if;
  select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into v_pos from unnest(coalesce(p_pos,'{}'::uuid[])) x;
  v_header_po:=case when cardinality(v_pos)=1 then v_pos[1] else null end;
  -- Serializes retries of the same request before looking up its result.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  v_payload:=jsonb_build_object('supplier',p_supplier,'pos',to_jsonb(v_pos),'slip',nullif(trim(p_slip),''),
    'date',p_date,'currency',p_currency,'stock',p_stock,'close',p_close,'notes',p_notes,'items',p_items);
  if exists(select 1 from public.purchase_receptions where id=p_id) then
    if not exists(select 1 from public.purchase_receptions where id=p_id and supplier_id=p_supplier and created_by=p_user) then raise exception 'Recepción incompatible'; end if;
    if not exists(select 1 from public.purchase_receptions where id=p_id and request_payload=v_payload) then raise exception 'Esta solicitud ya se guardó con otros datos. Revisá el remito registrado'; end if;
    return p_id;
  end if;
  -- Serialize same-provider receipts to prevent duplicate slip registration.
  perform 1 from public.suppliers where id=p_supplier for update;
  if not found then raise exception 'Proveedor inexistente'; end if;
  if nullif(trim(p_slip),'') is not null and exists(select 1 from public.purchase_receptions where supplier_id=p_supplier and lower(trim(delivery_slip_number))=lower(trim(p_slip))) then
    raise exception 'El remito ya está registrado para este proveedor';
  end if;
  foreach v_selected in array v_pos loop
    select * into v_po from public.purchase_orders where id=v_selected for update;
    if not found or v_po.supplier_id<>p_supplier or v_po.status in ('Cancelado','Cumplido') then raise exception 'OC no disponible para recibir o pertenece a otro proveedor'; end if;
  end loop;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ingresá artículos recibidos'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'poItemId','') is not null group by x->>'poItemId' having count(*)>1) then raise exception 'Línea de OC repetida'; end if;
  insert into public.purchase_receptions(id,supplier_id,purchase_order_id,delivery_slip_number,reception_date,notes,created_by,impacts_stock,currency,request_payload)
  values(p_id,p_supplier,v_header_po,nullif(trim(p_slip),''),p_date::timestamp at time zone 'America/Argentina/Buenos_Aires',p_notes,p_user,p_stock,p_currency,v_payload);
  insert into public.purchase_reception_orders(purchase_reception_id,purchase_order_id)
    select p_id, unnest(v_pos);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=round((v_item->>'quantity')::numeric,3); v_cost:=round((v_item->>'unitCost')::numeric,2);
    if v_qty is null or v_cost is null or v_qty<=0 or v_cost<0 or v_qty::text in ('NaN','Infinity','-Infinity') or v_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'Cantidad o costo inválidos'; end if;
    v_line_id:=nullif(v_item->>'poItemId','')::uuid;
    v_product:=nullif(v_item->>'productId','')::uuid;
    if v_line_id is not null then
      select * into v_line from public.purchase_order_items where id=v_line_id for update;
      if not found or not (v_line.purchase_order_id=any(v_pos)) or v_line.status='Cancelado' or v_line.shortfall_closed then raise exception 'Artículo ajeno a la OC o cancelado'; end if;
      if v_product is distinct from v_line.product_id then raise exception 'Producto incompatible con la OC'; end if;
      if v_qty>greatest(0,v_line.quantity_ordered-v_line.quantity_received) then raise exception 'La recepción supera la cantidad pendiente; ajustá la OC primero'; end if;
    end if;
    if p_stock and v_product is null then raise exception 'Vinculá el artículo a un producto para impactar stock'; end if;
    insert into public.purchase_reception_items(purchase_reception_id,purchase_order_item_id,product_id,product_name,quantity_received,unit_cost)
    values(p_id,v_line_id,v_product,case when v_line_id is not null then v_line.raw_product_name else v_item->>'productName' end,v_qty,v_cost);
    v_total:=v_total+round(v_qty*v_cost,2);
  end loop;
  if p_close then
    -- Explicitly close the remaining balances of the selected orders only.
    update public.purchase_order_items set status='Cumplido',shortfall_closed=true
    where purchase_order_id=any(v_pos) and status<>'Cancelado' and quantity_received<quantity_ordered;
    foreach v_selected in array v_pos loop
      perform public.recalculate_purchase_order_status(v_selected);
    end loop;
  end if;
  insert into public.supplier_purchases(supplier_id,invoice_number,purchase_date,total_amount,paid_amount,currency,status,document_type,purchase_order_id,purchase_reception_id,notes,created_by)
  values(p_supplier,coalesce(nullif(trim(p_slip),''),'REC-'||upper(left(p_id::text,8))),
    p_date::timestamp at time zone 'America/Argentina/Buenos_Aires',v_total,0,p_currency,'Pendiente','Remito',v_header_po,p_id,p_notes,p_user);
  return p_id;
end;
$$;
revoke all on function public.register_supplier_receipt_multi(uuid,uuid,uuid[],text,date,text,boolean,boolean,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.register_supplier_receipt_multi(uuid,uuid,uuid[],text,date,text,boolean,boolean,text,jsonb,uuid) to service_role;


commit;
