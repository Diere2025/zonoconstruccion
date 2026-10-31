-- Controlled services and adjustments: one payable, no physical reception/stock.
begin;
create table public.supplier_service_documents (
 bill_id uuid primary key references supplier_bills(id),purchase_id uuid not null unique references supplier_purchases(id),
 linked_purchase_id uuid references supplier_purchases(id),description text not null,evidence text not null,
 document_type text not null check(document_type in ('Factura','Nota de Débito','Nota de Crédito'))
);
create table public.supplier_service_events (
 request_id uuid primary key,actor_id uuid not null references auth.users(id),bill_id uuid not null references supplier_bills(id),
 payload jsonb not null,before_value jsonb,after_value jsonb not null,created_at timestamptz not null default now()
);
alter table supplier_service_documents enable row level security;
alter table supplier_service_events enable row level security;
revoke all on supplier_service_documents,supplier_service_events from public,anon,authenticated;
grant select,insert on supplier_service_documents,supplier_service_events to service_role;
create function public.guard_supplier_service_bill() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from supplier_service_documents where bill_id=old.id) and current_setting('zono.service_write',true) is distinct from 'on'
 and (new.status is distinct from old.status or new.declared_total is distinct from old.declared_total or new.supplier_id is distinct from old.supplier_id or new.currency is distinct from old.currency) then raise exception 'Corregí o anulá el servicio desde su circuito de comprobantes sin recepción.';end if;return new;
end $$;
create trigger supplier_service_bill_guard before update on supplier_bills for each row execute function guard_supplier_service_bill();
create function public.save_supplier_service(p_actor uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare request uuid:=(p_payload->>'requestId')::uuid;bill uuid:=(p_payload->>'id')::uuid;supplier uuid:=(p_payload->>'supplierId')::uuid;
 prior supplier_service_events;existing supplier_bills;service supplier_service_documents;item jsonb;net numeric;tax numeric;total numeric:=0;declared numeric;qty numeric;price numeric;vat numeric;before_value jsonb;purchase uuid;kind text:=p_payload->>'type';linked uuid:=nullif(p_payload->>'linkedPurchaseId','')::uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para registrar servicios y ajustes.' using errcode='42501';end if;
 if request is null or bill is null or supplier is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000 then raise exception 'Datos de comprobante incompletos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into prior from supplier_service_events where request_id=request;
 if found then if prior.actor_id<>p_actor or prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505';end if;return prior.bill_id;end if;
 perform 1 from suppliers where id=supplier for update;if not found then raise exception 'Proveedor inexistente.';end if;
 select * into existing from supplier_bills where id=bill for update;
 if coalesce((p_payload->>'void')::boolean,false) then
  select * into strict service from supplier_service_documents where bill_id=bill;
  if existing.supplier_id<>supplier or existing.status='Anulado' or existing.version<>(p_payload->>'version')::integer then raise exception 'El servicio cambió. Actualizá la vista.' using errcode='40001';end if;
  if supplier_purchase_cash_applied(service.purchase_id)>0 or supplier_purchase_credit_applied(service.purchase_id)>0
   or exists(select 1 from supplier_credit_allocations where credit_id=service.purchase_id)
   or supplier_opening_source_used('credit:'||service.purchase_id)>0 then raise exception 'Liberá los pagos y créditos antes de anular el servicio.';end if;
  before_value:=jsonb_build_object('bill',to_jsonb(existing),'service',to_jsonb(service));
  perform set_config('zono.service_write','on',true);
  update supplier_bills set status='Anulado',version=version+1,updated_by=p_actor,updated_at=clock_timestamp(),resolution=p_payload->>'reason' where id=bill;
  update supplier_purchases set status='Anulado' where id=service.purchase_id;
 else
  if existing.id is not null then raise exception 'El comprobante ya existe. Para corregirlo anulalo con motivo.';end if;
  if coalesce(kind,'') not in ('Factura','Nota de Débito','Nota de Crédito') or coalesce(p_payload->>'currency','') not in ('ARS','USD')
   or length(trim(coalesce(p_payload->>'number',''))) not between 1 and 100 or length(trim(coalesce(p_payload->>'description',''))) not between 3 and 2000
   or length(trim(coalesce(p_payload->>'evidence',''))) not between 3 and 2000 or nullif(p_payload->>'date','')::date is null
   or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Completá referencia, servicio, respaldo y líneas.';end if;
  if linked is not null and not exists(select 1 from supplier_purchases where id=linked and supplier_id=supplier and currency=p_payload->>'currency' and status<>'Anulado' and document_type is distinct from 'Nota de Crédito') then raise exception 'El documento relacionado no pertenece al proveedor o moneda.';end if;
  if exists(select 1 from supplier_purchases p where p.supplier_id=supplier and p.document_type=kind and lower(trim(p.invoice_number))=lower(trim(p_payload->>'number')) and p.status<>'Anulado') then raise exception 'Ya existe un documento vigente con ese tipo y número. Revisalo antes de registrar otro.' using errcode='23505';end if;
  for item in select x from jsonb_array_elements(p_payload->'lines') x loop
   qty:=(item->>'quantity')::numeric;price:=(item->>'unitPrice')::numeric;vat:=(item->>'vat')::numeric;
   if qty is null or price is null or vat is null or qty<=0 or qty<>round(qty,3) or price<0 or price<>round(price,2) or vat not between 0 and 100 or qty>=1000000000 or price>=1000000000000 or length(trim(coalesce(item->>'description',''))) not between 1 and 500 then raise exception 'Cantidad, precio o IVA inválidos.';end if;
   net:=round(qty*price,2);tax:=round(net*vat/100,2);total:=total+net+tax;
  end loop;
  declared:=(p_payload->>'total')::numeric;
  if declared is null or declared<=0 or declared>=1000000000000 or declared<>round(declared,2) or total<>declared then raise exception 'Las líneas con IVA deben sumar exactamente el total declarado.';end if;
  purchase:=gen_random_uuid();
  insert into supplier_purchases(id,supplier_id,invoice_number,purchase_date,due_date,total_amount,paid_amount,currency,status,notes,created_by,document_type)
   values(purchase,supplier,trim(p_payload->>'number'),((p_payload->>'date')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'),(nullif(p_payload->>'dueDate','')::date::timestamp at time zone 'UTC'),declared,0,p_payload->>'currency','Pendiente',trim(p_payload->>'description'),p_actor,kind);
  -- The bill header enables the same audited installment scheduler as merchandise bills.
  insert into supplier_bills(id,supplier_id,number,document_type,bill_date,due_date,currency,declared_total,calculated_total,status,notes,created_by,updated_by)
   values(bill,supplier,case when kind='Factura' then trim(p_payload->>'number') else kind||' · '||trim(p_payload->>'number') end,'Factura',(p_payload->>'date')::date,nullif(p_payload->>'dueDate','')::date,p_payload->>'currency',declared,declared,'Conciliado',trim(p_payload->>'description'),p_actor,p_actor);
  insert into supplier_service_documents values(bill,purchase,linked,trim(p_payload->>'description'),trim(p_payload->>'evidence'),kind);
 end if;
 insert into supplier_service_events(request_id,actor_id,bill_id,payload,before_value,after_value)
 select request,p_actor,bill,p_payload,before_value,jsonb_build_object('bill',to_jsonb(b),'service',to_jsonb(s)) from supplier_bills b join supplier_service_documents s on s.bill_id=b.id where b.id=bill;
 return bill;
end $$;
revoke all on function guard_supplier_service_bill(),save_supplier_service(uuid,jsonb) from public,anon,authenticated;
grant execute on function guard_supplier_service_bill(),save_supplier_service(uuid,jsonb) to service_role;
create or replace view public.supplier_payable_base_items as
with billed as (
 select p.id purchase_id,b.id bill_id,b.supplier_id,b.currency,b.document_type,b.number reference,b.bill_date entry_date,b.due_date,
 sum(l.payable_amount)::numeric(15,2) amount
 from supplier_bill_lines l join supplier_bills b on b.id=l.bill_id and b.status='Conciliado'
 join purchase_reception_items i on i.id=l.receipt_item_id
 join supplier_purchases p on p.purchase_reception_id=i.purchase_reception_id and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito'
 group by p.id,b.id
 union all
 select p.id,b.id,b.supplier_id,b.currency,s.document_type,p.invoice_number,b.bill_date,b.due_date,round(p.total_amount,2)
 from supplier_service_documents s join supplier_bills b on b.id=s.bill_id and b.status='Conciliado'
 join supplier_purchases p on p.id=s.purchase_id and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito'
), receipt_ranges as (
 select *,sum(amount) over(partition by bill_id order by purchase_id)-amount lo,
 sum(amount) over(partition by bill_id order by purchase_id) hi from billed
), schedules as (
 select bill_id,number,due_date,amount from supplier_bill_installments
 union all
 select b.id,1,b.due_date,b.declared_total from supplier_bills b where b.status='Conciliado' and not exists(select 1 from supplier_bill_installments i where i.bill_id=b.id)
), schedule_ranges as (
 select *,sum(amount) over(partition by bill_id order by number)-amount lo,
 sum(amount) over(partition by bill_id order by number) hi from schedules
), items as (
 select 'bill:'||r.bill_id||':'||r.purchase_id||':'||s.number item_key,r.purchase_id,r.bill_id,s.number installment_number,
 r.reference,r.document_type,case when r.document_type='Factura' then 'facturado' else 'por_remito' end document_condition,
 r.entry_date,s.due_date,greatest(0,least(r.hi,s.hi)-greatest(r.lo,s.lo))::numeric(15,2) amount
 from receipt_ranges r join schedule_ranges s on s.bill_id=r.bill_id where least(r.hi,s.hi)>greatest(r.lo,s.lo)
 union all
 select 'purchase:'||p.id,p.id,null::uuid,1,p.invoice_number::text,coalesce(p.document_type,'Remito')::text,
 case when p.purchase_reception_id is null and p.document_type='Factura' then 'facturado' else 'por_remito' end,
 (coalesce(p.purchase_date,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date,
 (p.due_date at time zone 'UTC')::date,
 (round(p.total_amount,2)-coalesce((select sum(b.amount) from billed b where b.purchase_id=p.id),0))::numeric(15,2)
 from supplier_purchases p where p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito'
  and round(p.total_amount,2)>coalesce((select sum(b.amount) from billed b where b.purchase_id=p.id),0)
), projected as (
 select i.*,p.supplier_id,p.currency,round(p.total_amount,2) document_total,
 supplier_purchase_cash_applied(p.id) cash_applied,supplier_purchase_credit_applied(p.id) credit_applied,
 supplier_document_in_account(p.id) included,count(*) over(partition by i.purchase_id) part_count
 from items i join supplier_purchases p on p.id=i.purchase_id
)
select *,
 case when cash_applied+credit_applied=0 then amount
  when cash_applied+credit_applied>=document_total then 0
  when part_count=1 then greatest(0,amount-cash_applied-credit_applied) else null end::numeric(15,2) pending_amount,
 (part_count>1 and cash_applied+credit_applied>0 and cash_applied+credit_applied<document_total) needs_allocation
from projected;

notify pgrst,'reload schema';
commit;
