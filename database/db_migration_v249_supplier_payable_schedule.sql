-- Read model of existing debt + audited due-date schedules. No debt/cash posting.
begin;
create table public.supplier_bill_installments (
 bill_id uuid not null references supplier_bills(id),number integer not null check(number between 1 and 60),
 due_date date not null,amount numeric(15,2) not null check(amount>0 and amount<1000000000000),
 primary key(bill_id,number)
);
create table public.supplier_bill_schedule_events (
 id uuid primary key default gen_random_uuid(),bill_id uuid not null references supplier_bills(id),
 actor_id uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,
 before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table public.supplier_bill_installments enable row level security;
alter table public.supplier_bill_schedule_events enable row level security;
revoke all on public.supplier_bill_installments,public.supplier_bill_schedule_events from public,anon,authenticated;
grant all on public.supplier_bill_installments to service_role;
grant select,insert on public.supplier_bill_schedule_events to service_role;
create function public.supplier_bill_schedule_signature(p_bill uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(b)::text||coalesce((select jsonb_agg(to_jsonb(i) order by i.number)::text from supplier_bill_installments i where i.bill_id=b.id),'[]')) from supplier_bills b where b.id=p_bill
$$;
create function public.save_supplier_bill_schedule(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare bill public.supplier_bills; prior public.supplier_bill_schedule_events; item jsonb; total numeric:=0; value numeric; n integer:=0; before_value jsonb; result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para programar vencimientos.' using errcode='42501'; end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000
  or jsonb_typeof(p_payload->'installments') is distinct from 'array' or jsonb_array_length(p_payload->'installments')>60 then raise exception 'Plan de vencimientos inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-schedule:'||p_request::text,0));
 select * into prior from supplier_bill_schedule_events where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505'; end if;
  return prior.after_value;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict bill from supplier_bills where id=(p_payload->>'billId')::uuid for update;
 if bill.status<>'Conciliado' then raise exception 'Confirmá la conciliación del comprobante antes de programar cuotas.'; end if;
 if supplier_bill_schedule_signature(bill.id) is distinct from p_payload->>'signature' then raise exception 'El comprobante o sus vencimientos cambiaron. Actualizá la vista.' using errcode='40001'; end if;
 before_value:=jsonb_build_object('bill',to_jsonb(bill),'installments',coalesce((select jsonb_agg(to_jsonb(i) order by number) from supplier_bill_installments i where bill_id=bill.id),'[]'));
 for item in select x from jsonb_array_elements(p_payload->'installments') x loop
  value:=(item->>'amount')::numeric;
  if value is null or value<=0 or value<>round(value,2) or value>=1000000000000 or nullif(item->>'dueDate','')::date is null then raise exception 'Cada cuota requiere fecha e importe positivo con centavos.'; end if;
  total:=total+value;
 end loop;
 if jsonb_array_length(p_payload->'installments')>0 and total<>round(bill.declared_total,2) then raise exception 'Las cuotas deben sumar exactamente el total del comprobante.'; end if;
 delete from supplier_bill_installments where bill_id=bill.id;
 for item in select x from jsonb_array_elements(p_payload->'installments') x loop
  n:=n+1;insert into supplier_bill_installments(bill_id,number,due_date,amount) values(bill.id,n,(item->>'dueDate')::date,(item->>'amount')::numeric);
 end loop;
 result:=jsonb_build_object('billId',bill.id,'signature',supplier_bill_schedule_signature(bill.id),'installments',coalesce((select jsonb_agg(to_jsonb(i) order by number) from supplier_bill_installments i where bill_id=bill.id),'[]'));
 insert into supplier_bill_schedule_events(bill_id,actor_id,request_id,payload,before_value,after_value) values(bill.id,p_actor,p_request,p_payload,before_value,result);
 return result;
end $$;

create view public.supplier_payable_items as
with billed as (
 select p.id purchase_id,b.id bill_id,b.supplier_id,b.currency,b.document_type,b.number reference,b.bill_date entry_date,b.due_date,
 sum(l.payable_amount)::numeric(15,2) amount
 from supplier_bill_lines l join supplier_bills b on b.id=l.bill_id and b.status='Conciliado'
 join purchase_reception_items i on i.id=l.receipt_item_id
 join supplier_purchases p on p.purchase_reception_id=i.purchase_reception_id and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito'
 group by p.id,b.id
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
revoke all on public.supplier_payable_items from public,anon,authenticated;
grant select on public.supplier_payable_items to service_role;
revoke all on function public.supplier_bill_schedule_signature(uuid),public.save_supplier_bill_schedule(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.supplier_bill_schedule_signature(uuid),public.save_supplier_bill_schedule(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
