-- Invoice evidence regularizes the receipt payable; it never posts another purchase or inventory entry.
begin;
create table public.supplier_bills (
  id uuid primary key,
  supplier_id uuid not null references public.suppliers(id),
  number text not null check(length(trim(number)) between 1 and 100),
  document_type text not null check(document_type in ('Factura','Boleta')),
  bill_date date not null,
  due_date date,
  currency text not null check(currency in ('ARS','USD')),
  perceptions_ba numeric(15,2) not null default 0 check(perceptions_ba>=0),
  perceptions_caba numeric(15,2) not null default 0 check(perceptions_caba>=0),
  perceptions_other numeric(15,2) not null default 0 check(perceptions_other>=0),
  declared_total numeric(15,2) not null check(declared_total>=0),
  calculated_total numeric(15,2) not null check(calculated_total>=0),
  status text not null check(status in ('Pendiente','Con diferencias','Conciliado','Anulado')),
  notes text not null default '',
  resolution text not null default '',
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index supplier_bill_number_active on public.supplier_bills(supplier_id,document_type,lower(trim(number))) where status<>'Anulado';
create table public.supplier_bill_lines (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.supplier_bills(id),
  receipt_item_id uuid not null references public.purchase_reception_items(id),
  quantity numeric(12,3) not null check(quantity>0),
  unit_price numeric(15,2) not null check(unit_price>=0),
  discount numeric(7,4) not null check(discount between 0 and 100),
  vat numeric(7,4) not null check(vat between 0 and 100),
  expected_unit_cost numeric(15,2) not null,
  net_amount numeric(15,2) not null,
  tax_amount numeric(15,2) not null,
  payable_amount numeric(15,2) not null default 0,
  unique(bill_id,receipt_item_id)
);
create index supplier_bill_lines_receipt on public.supplier_bill_lines(receipt_item_id);
create index supplier_bills_supplier on public.supplier_bills(supplier_id,bill_date);
create table public.supplier_bill_events (
  request_id uuid primary key,
  bill_id uuid not null references public.supplier_bills(id),
  actor_id uuid not null references auth.users(id),
  payload jsonb not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.supplier_purchases add column reconciliation_base_amount numeric(15,2);
alter table public.supplier_bills enable row level security;
alter table public.supplier_bill_lines enable row level security;
alter table public.supplier_bill_events enable row level security;
revoke all on public.supplier_bills,public.supplier_bill_lines,public.supplier_bill_events from anon,authenticated;
grant all on public.supplier_bills,public.supplier_bill_lines,public.supplier_bill_events to service_role;

create or replace function public.save_supplier_bill(p_payload jsonb,p_user uuid)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare
  v_id uuid:=(p_payload->>'id')::uuid; v_request uuid:=(p_payload->>'requestId')::uuid;
  v_supplier uuid:=(p_payload->>'supplierId')::uuid; v_version integer:=(p_payload->>'version')::integer;
  v_confirm boolean:=(p_payload->>'confirm')::boolean; v_void boolean:=coalesce((p_payload->>'void')::boolean,false);
  v_old public.supplier_bills%rowtype; v_before jsonb; v_event public.supplier_bill_events%rowtype;
  v_line jsonb; v_item record; v_qty numeric; v_price numeric; v_discount numeric; v_vat numeric;
  v_expected numeric; v_net numeric; v_tax numeric; v_total numeric:=0; v_declared numeric;
  v_perceptions numeric; v_differences boolean:=false; v_allocated numeric:=0; v_allocation numeric;
  v_record record; v_purchase record; v_delta numeric; v_new_total numeric; v_last uuid; v_status text;
begin
  if p_user is null or v_id is null or v_request is null or v_supplier is null or v_version is null or v_version<0 then raise exception 'Datos de comprobante incompletos'; end if;
  perform 1 from public.suppliers where id=v_supplier for update;
  if not found then raise exception 'Proveedor inexistente'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,219));
  select * into v_event from public.supplier_bill_events where request_id=v_request;
  if found then
    if v_event.actor_id<>p_user or v_event.payload<>p_payload then raise exception 'Solicitud ya utilizada con otros datos'; end if;
    return v_event.bill_id;
  end if;
  select * into v_old from public.supplier_bills where id=v_id for update;
  if found then
    if v_old.supplier_id<>v_supplier or v_old.version<>v_version then raise exception 'El comprobante cambió; actualizá la pantalla'; end if;
    v_before:=to_jsonb(v_old)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l)) from public.supplier_bill_lines l where bill_id=v_id));
    if v_old.status='Anulado' or (v_old.status='Conciliado' and not v_void) then raise exception 'El comprobante está cerrado. Anulalo con motivo para corregirlo'; end if;
  elsif v_version<>0 or v_void then raise exception 'Comprobante inexistente o versión incorrecta'; end if;
  if v_void then
    if length(trim(coalesce(p_payload->>'resolution','')))=0 then raise exception 'Anotá el motivo de anulación'; end if;
    update public.supplier_bills set status='Anulado',resolution=trim(p_payload->>'resolution'),version=version+1,updated_by=p_user,updated_at=now() where id=v_id;
  else
    if v_confirm is null or p_payload->>'type' is null or p_payload->>'type' not in ('Factura','Boleta')
      or p_payload->>'currency' is null or p_payload->>'currency' not in ('ARS','USD')
      or length(trim(coalesce(p_payload->>'number',''))) not between 1 and 100 or (p_payload->>'date')::date is null
      or jsonb_typeof(p_payload->'lines') is distinct from 'array' then raise exception 'Completá los datos y artículos del comprobante'; end if;
    if jsonb_array_length(p_payload->'lines') not between 1 and 500 then raise exception 'Elegí entre 1 y 500 líneas recibidas'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'receiptItemId' having count(*)>1) then raise exception 'Línea de recepción repetida'; end if;
    v_perceptions:=round((p_payload->>'perceptionsBa')::numeric,2)+round((p_payload->>'perceptionsCaba')::numeric,2)+round((p_payload->>'perceptionsOther')::numeric,2);
    v_declared:=round((p_payload->>'declaredTotal')::numeric,2);
    if v_declared is null or v_perceptions is null or exists(select 1 from unnest(array[(p_payload->>'perceptionsBa')::numeric,(p_payload->>'perceptionsCaba')::numeric,(p_payload->>'perceptionsOther')::numeric,v_declared]) n where n<0 or n::text in ('NaN','Infinity','-Infinity')) then raise exception 'Importes inválidos'; end if;
    insert into public.supplier_bills(id,supplier_id,number,document_type,bill_date,due_date,currency,perceptions_ba,perceptions_caba,perceptions_other,declared_total,calculated_total,status,notes,resolution,created_by,updated_by)
    values(v_id,v_supplier,trim(p_payload->>'number'),p_payload->>'type',(p_payload->>'date')::date,nullif(p_payload->>'dueDate','')::date,p_payload->>'currency',
      (p_payload->>'perceptionsBa')::numeric,(p_payload->>'perceptionsCaba')::numeric,(p_payload->>'perceptionsOther')::numeric,v_declared,0,'Pendiente',coalesce(p_payload->>'notes',''),coalesce(p_payload->>'resolution',''),p_user,p_user)
    on conflict(id) do update set number=excluded.number,document_type=excluded.document_type,bill_date=excluded.bill_date,due_date=excluded.due_date,currency=excluded.currency,
      perceptions_ba=excluded.perceptions_ba,perceptions_caba=excluded.perceptions_caba,perceptions_other=excluded.perceptions_other,declared_total=excluded.declared_total,
      notes=excluded.notes,resolution=excluded.resolution,version=supplier_bills.version+1,updated_by=p_user,updated_at=now();
    delete from public.supplier_bill_lines where bill_id=v_id;
    for v_line in select * from jsonb_array_elements(p_payload->'lines') loop
      select i.*,r.supplier_id,r.currency,o.unit_cost as agreed_cost into v_item
      from public.purchase_reception_items i join public.purchase_receptions r on r.id=i.purchase_reception_id
      left join public.purchase_order_items o on o.id=i.purchase_order_item_id
      where i.id=(v_line->>'receiptItemId')::uuid for update of i;
      if not found or v_item.supplier_id<>v_supplier or v_item.currency<>p_payload->>'currency' then raise exception 'Artículo ajeno al proveedor o a la moneda'; end if;
      perform 1 from public.supplier_purchases p where p.purchase_reception_id=v_item.purchase_reception_id and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito' for update;
      if not found then raise exception 'La recepción no tiene una deuda vigente; conciliá su historial primero'; end if;
      v_qty:=(v_line->>'quantity')::numeric; v_price:=(v_line->>'unitPrice')::numeric;v_discount:=(v_line->>'discount')::numeric;v_vat:=(v_line->>'vat')::numeric;
      if v_qty is null or v_price is null or v_discount is null or v_vat is null or v_qty<=0 or v_qty<>round(v_qty,3) or v_price<0 or v_discount not between 0 and 100 or v_vat not between 0 and 100
        or exists(select 1 from unnest(array[v_qty,v_price,v_discount,v_vat]) n where n::text in ('NaN','Infinity','-Infinity')) then raise exception 'Cantidad, precio, descuento o IVA inválidos'; end if;
      if v_qty+coalesce((select sum(l.quantity) from public.supplier_bill_lines l join public.supplier_bills b on b.id=l.bill_id where l.receipt_item_id=v_item.id and b.status='Conciliado' and b.id<>v_id),0)>v_item.quantity_received then raise exception 'La cantidad supera lo recibido pendiente de facturar'; end if;
      v_expected:=coalesce(v_item.agreed_cost,v_item.unit_cost);
      v_net:=round(v_qty*round(v_price,2)*(1-round(v_discount,4)/100),2);v_tax:=round(v_net*round(v_vat,4)/100,2);
      if abs(v_net-round(v_qty*v_expected,2))>0.01 then v_differences:=true; end if;
      insert into public.supplier_bill_lines(bill_id,receipt_item_id,quantity,unit_price,discount,vat,expected_unit_cost,net_amount,tax_amount)
      values(v_id,v_item.id,v_qty,v_price,v_discount,v_vat,v_expected,v_net,v_tax);
      v_total:=v_total+v_net+v_tax;
    end loop;
    v_total:=v_total+v_perceptions;
    if abs(v_declared-v_total)>0.01 then v_differences:=true; end if;
    if v_confirm and v_differences and length(trim(coalesce(p_payload->>'resolution','')))=0 then raise exception 'Hay diferencias. Anotá cómo se resolvieron para conciliar'; end if;
    v_status:=case when v_confirm then 'Conciliado' when v_differences then 'Con diferencias' else 'Pendiente' end;
    update public.supplier_bills set calculated_total=v_total,status=v_status where id=v_id;
    -- Allocate perceptions and an explicitly accepted total difference by net weight.
    select id into v_last from public.supplier_bill_lines where bill_id=v_id order by id desc limit 1;
    for v_record in select * from public.supplier_bill_lines where bill_id=v_id order by id loop
      v_allocation:=case when v_record.id=v_last then v_declared-v_allocated
        else round(v_declared * case when v_total-v_perceptions>0 then (v_record.net_amount+v_record.tax_amount)/(v_total-v_perceptions)
          else 1.0/(select count(*) from public.supplier_bill_lines where bill_id=v_id) end,2) end;
      if v_allocation<0 then raise exception 'El total no permite distribuir el comprobante; revisá sus importes'; end if;
      update public.supplier_bill_lines set payable_amount=v_allocation where id=v_record.id;
      v_allocated:=v_allocated+v_allocation;
    end loop;
  end if;
  -- Recompute from original debt plus approved deltas; edits, retries and reversals cannot compound the adjustment.
  for v_purchase in select p.* from public.supplier_purchases p where p.purchase_reception_id in
    (select i.purchase_reception_id from public.supplier_bill_lines l join public.purchase_reception_items i on i.id=l.receipt_item_id where l.bill_id=v_id)
    and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito' order by p.id for update of p
  loop
    select coalesce(sum(l.payable_amount-round(l.quantity*i.unit_cost,2)),0) into v_delta
      from public.supplier_bill_lines l join public.supplier_bills b on b.id=l.bill_id join public.purchase_reception_items i on i.id=l.receipt_item_id
      where i.purchase_reception_id=v_purchase.purchase_reception_id and b.status='Conciliado';
    v_new_total:=coalesce(v_purchase.reconciliation_base_amount,v_purchase.total_amount)+v_delta;
    -- On full billing use the exact sum of invoice allocations, including split-line rounding.
    if not exists(select 1 from public.purchase_reception_items i where i.purchase_reception_id=v_purchase.purchase_reception_id
      and i.quantity_received>coalesce((select sum(l.quantity) from public.supplier_bill_lines l join public.supplier_bills b on b.id=l.bill_id where l.receipt_item_id=i.id and b.status='Conciliado'),0)) then
      select coalesce(sum(l.payable_amount),0) into v_new_total from public.supplier_bill_lines l join public.supplier_bills b on b.id=l.bill_id
        join public.purchase_reception_items i on i.id=l.receipt_item_id where i.purchase_reception_id=v_purchase.purchase_reception_id and b.status='Conciliado';
    end if;
    if v_new_total<coalesce(v_purchase.paid_amount,0) or v_new_total<0 then raise exception 'El ajuste deja un pago excedente. Regularizá su imputación en Finanzas antes de conciliar o anular'; end if;
    update public.supplier_purchases set reconciliation_base_amount=coalesce(reconciliation_base_amount,total_amount),total_amount=v_new_total,
      status=case when v_new_total<=coalesce(paid_amount,0) then 'Pagado' when coalesce(paid_amount,0)>0 then 'Parcial' else 'Pendiente' end where id=v_purchase.id;
  end loop;
  insert into public.supplier_bill_events(request_id,bill_id,actor_id,payload,before_data,after_data)
  select v_request,v_id,p_user,p_payload,v_before,to_jsonb(b)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l)) from public.supplier_bill_lines l where bill_id=v_id)) from public.supplier_bills b where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.save_supplier_bill(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_supplier_bill(jsonb,uuid) to service_role;

-- Legacy editors must not override amounts being managed by reconciliation.
create function public.guard_reconciled_supplier_payable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' and new.purchase_reception_id is not null
    and (new.total_amount is distinct from old.total_amount or new.currency is distinct from old.currency
      or new.invoice_number is distinct from old.invoice_number or new.document_type is distinct from old.document_type) then
    raise exception 'Completá el comprobante y conciliá desde la recepción';
  end if;
  return new;
end; $$;
create trigger supplier_payable_reconciliation_guard before update on public.supplier_purchases for each row execute function public.guard_reconciled_supplier_payable();
commit;
