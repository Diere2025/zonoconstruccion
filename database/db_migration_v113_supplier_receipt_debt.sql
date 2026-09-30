-- Atomic receipt + payable, with or without inventory impact.
begin;
alter table public.purchase_receptions add column if not exists impacts_stock boolean not null default true;
alter table public.purchase_receptions add column if not exists currency text not null default 'ARS' check(currency in ('ARS','USD'));
alter table public.purchase_receptions add column if not exists request_payload jsonb;
update public.purchase_receptions set impacts_stock=false
where notes like '%[Recepción administrativa sin impacto en stock]%';
alter table public.purchase_reception_items alter column product_id drop not null;
alter table public.purchase_reception_items add column if not exists product_name text;
-- Preserve received quantities that were historically posted without receipt items.
alter table public.purchase_order_items add column if not exists legacy_received_quantity numeric(12,3) not null default 0;
alter table public.purchase_order_items add column if not exists shortfall_closed boolean not null default false;
update public.purchase_order_items i set legacy_received_quantity=greatest(0,i.quantity_received-
  coalesce((select sum(r.quantity_received) from public.purchase_reception_items r where r.purchase_order_item_id=i.id),0));

create or replace function public.sync_purchase_order_quantities()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_id uuid; v_po uuid; v_ordered numeric; v_legacy numeric; v_sum numeric; v_status text; v_closed boolean;
begin
  for v_id in select distinct x from unnest(array[
    case when tg_op <> 'INSERT' then old.purchase_order_item_id end,
    case when tg_op <> 'DELETE' then new.purchase_order_item_id end]) x where x is not null
  loop
    select i.purchase_order_id,i.quantity_ordered,i.legacy_received_quantity,i.status,i.shortfall_closed
      into v_po,v_ordered,v_legacy,v_status,v_closed from public.purchase_order_items i where i.id=v_id for update;
    if v_po is null or v_status='Cancelado' or exists(select 1 from public.purchase_orders where id=v_po and status='Cancelado') then continue; end if;
    select coalesce(sum(quantity_received),0)+v_legacy into v_sum from public.purchase_reception_items where purchase_order_item_id=v_id;
    update public.purchase_order_items set quantity_received=v_sum,
      status=case when v_closed or v_sum>=v_ordered then 'Cumplido' when v_sum>0 then 'Parcial' else 'Pendiente' end where id=v_id;
    perform public.recalculate_purchase_order_status(v_po);
  end loop;
  return null;
end;
$$;

create or replace function public.sync_purchase_reception_stock()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_pair record; v_qty numeric; v_user uuid; v_impact boolean;
begin
  for v_pair in
    select distinct rec,prod from (values
      (case when tg_op<>'INSERT' then old.purchase_reception_id end, case when tg_op<>'INSERT' then old.product_id end),
      (case when tg_op<>'DELETE' then new.purchase_reception_id end, case when tg_op<>'DELETE' then new.product_id end)) p(rec,prod)
    where rec is not null and prod is not null
  loop
    select impacts_stock,created_by into v_impact,v_user from public.purchase_receptions where id=v_pair.rec;
    -- Administrative receipts must never create an inventory transaction.
    if v_impact is false then continue; end if;
    delete from public.inventory_transactions where reference_id=v_pair.rec and product_id=v_pair.prod and type='Compra';
    select coalesce(sum(quantity_received),0) into v_qty from public.purchase_reception_items where purchase_reception_id=v_pair.rec and product_id=v_pair.prod;
    if v_impact and v_qty>0 then
      insert into public.inventory_transactions(product_id,quantity,type,reference_id,user_id,created_at)
      values(v_pair.prod,v_qty,'Compra',v_pair.rec,v_user,now());
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.register_supplier_receipt(
  p_id uuid,p_supplier uuid,p_po uuid,p_slip text,p_date date,p_currency text,
  p_stock boolean,p_close boolean,p_notes text,p_items jsonb,p_user uuid
) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_item jsonb; v_line public.purchase_order_items%rowtype; v_qty numeric; v_cost numeric;
  v_product uuid; v_line_id uuid; v_total numeric:=0; v_po public.purchase_orders%rowtype; v_payload jsonb;
begin
  if p_id is null or p_user is null or p_supplier is null or p_date is null or p_stock is null or p_close is null
    or p_currency is null or p_currency not in ('ARS','USD') then raise exception 'Datos de recepción incompletos'; end if;
  -- Serializes retries of the same request before looking up its result.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  v_payload:=jsonb_build_object('supplier',p_supplier,'po',p_po,'slip',nullif(trim(p_slip),''),
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
  if p_po is not null then
    select * into v_po from public.purchase_orders where id=p_po for update;
    if not found or v_po.supplier_id<>p_supplier or v_po.status in ('Cancelado','Cumplido') then raise exception 'OC no disponible para recibir'; end if;
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ingresá artículos recibidos'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'poItemId','') is not null group by x->>'poItemId' having count(*)>1) then raise exception 'Línea de OC repetida'; end if;
  insert into public.purchase_receptions(id,supplier_id,purchase_order_id,delivery_slip_number,reception_date,notes,created_by,impacts_stock,currency,request_payload)
  values(p_id,p_supplier,p_po,nullif(trim(p_slip),''),p_date::timestamp at time zone 'America/Argentina/Buenos_Aires',p_notes,p_user,p_stock,p_currency,v_payload);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=round((v_item->>'quantity')::numeric,3); v_cost:=round((v_item->>'unitCost')::numeric,2);
    if v_qty is null or v_cost is null or v_qty<=0 or v_cost<0 or v_qty::text in ('NaN','Infinity','-Infinity') or v_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'Cantidad o costo inválidos'; end if;
    v_line_id:=nullif(v_item->>'poItemId','')::uuid;
    v_product:=nullif(v_item->>'productId','')::uuid;
    if v_line_id is not null then
      select * into v_line from public.purchase_order_items where id=v_line_id for update;
      if not found or p_po is null or v_line.purchase_order_id<>p_po or v_line.status='Cancelado' then raise exception 'Artículo ajeno a la OC o cancelado'; end if;
      if v_product is distinct from v_line.product_id then raise exception 'Producto incompatible con la OC'; end if;
      if v_qty>greatest(0,v_line.quantity_ordered-v_line.quantity_received) then raise exception 'La recepción supera la cantidad pendiente; ajustá la OC primero'; end if;
    end if;
    if p_stock and v_product is null then raise exception 'Vinculá el artículo a un producto para impactar stock'; end if;
    insert into public.purchase_reception_items(purchase_reception_id,purchase_order_item_id,product_id,product_name,quantity_received,unit_cost)
    values(p_id,v_line_id,v_product,case when v_line_id is not null then v_line.raw_product_name else v_item->>'productName' end,v_qty,v_cost);
    v_total:=v_total+round(v_qty*v_cost,2);
  end loop;
  if p_close and p_po is not null then
    -- Retain ordered quantities and record the explicit shortfall closure.
    update public.purchase_order_items set status='Cumplido',shortfall_closed=true
    where purchase_order_id=p_po and status<>'Cancelado' and quantity_received<quantity_ordered;
    perform public.recalculate_purchase_order_status(p_po);
  end if;
  insert into public.supplier_purchases(supplier_id,invoice_number,purchase_date,total_amount,paid_amount,currency,status,document_type,purchase_order_id,purchase_reception_id,notes,created_by)
  values(p_supplier,coalesce(nullif(trim(p_slip),''),'REC-'||upper(left(p_id::text,8))),
    p_date::timestamp at time zone 'America/Argentina/Buenos_Aires',v_total,0,p_currency,'Pendiente','Remito',p_po,p_id,p_notes,p_user);
  return p_id;
end;
$$;
revoke all on function public.register_supplier_receipt(uuid,uuid,uuid,text,date,text,boolean,boolean,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.register_supplier_receipt(uuid,uuid,uuid,text,date,text,boolean,boolean,text,jsonb,uuid) to service_role;

-- A subsequent invoice should update the receipt's payable instead of posting
-- the same liability a second time. Credit notes remain separate documents.
create or replace function public.guard_supplier_receipt_payable()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_supplier uuid;
begin
  if new.purchase_reception_id is null then return new; end if;
  select supplier_id into v_supplier from public.purchase_receptions where id=new.purchase_reception_id for update;
  if v_supplier is distinct from new.supplier_id then raise exception 'El documento y la recepción deben pertenecer al mismo proveedor'; end if;
  if new.status is distinct from 'Anulado' and new.document_type is distinct from 'Nota de Crédito'
    and exists(select 1 from public.supplier_purchases p where p.purchase_reception_id=new.purchase_reception_id
      and p.id<>new.id and p.status is distinct from 'Anulado' and p.document_type is distinct from 'Nota de Crédito') then
    raise exception 'La recepción ya generó deuda. Actualizá ese documento con los datos de la factura';
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_receipt_payable_guard on public.supplier_purchases;
create trigger supplier_receipt_payable_guard before insert or update on public.supplier_purchases
for each row execute function public.guard_supplier_receipt_payable();
commit;
