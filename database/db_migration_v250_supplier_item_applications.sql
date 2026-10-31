-- Exact detail of existing document applications; never changes a payment or cash.
begin;
set local search_path=public,pg_temp;
alter table supplier_purchases add column payable_structure_version bigint not null default 0 check(payable_structure_version>=0);
alter view supplier_payable_items rename to supplier_payable_base_items;
create table supplier_payable_application_details (
 id uuid primary key default gen_random_uuid(),payment_id uuid references supplier_payments(id),credit_id uuid references supplier_purchases(id),
 purchase_id uuid not null references supplier_purchases(id),item_key text not null,amount numeric(15,2) not null check(amount>0 and amount<1000000000000),
 source_signature text not null,layout_signature text not null,check(num_nonnulls(payment_id,credit_id)=1)
);
create unique index supplier_item_payment_pair on supplier_payable_application_details(payment_id,item_key) where payment_id is not null;
create unique index supplier_item_credit_pair on supplier_payable_application_details(credit_id,item_key) where credit_id is not null;
create index supplier_item_purchase on supplier_payable_application_details(purchase_id);
create table supplier_payable_application_events (
 id uuid primary key default gen_random_uuid(),payment_id uuid references supplier_payments(id),credit_id uuid references supplier_purchases(id),
 actor_id uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,before_value jsonb not null,after_value jsonb not null,
 created_at timestamptz not null default now(),unique(actor_id,request_id),check(num_nonnulls(payment_id,credit_id)=1)
);
alter table supplier_payable_application_details enable row level security;
alter table supplier_payable_application_events enable row level security;
revoke all on supplier_payable_application_details,supplier_payable_application_events from public,anon,authenticated;
grant all on supplier_payable_application_details to service_role;
grant select,insert on supplier_payable_application_events to service_role;

create function supplier_part_structure_revision() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.total_amount is distinct from old.total_amount or new.currency is distinct from old.currency or new.supplier_id is distinct from old.supplier_id
  or new.purchase_reception_id is distinct from old.purchase_reception_id or (new.status='Anulado') is distinct from (old.status='Anulado') then
  new.payable_structure_version:=old.payable_structure_version+1;
 else new.payable_structure_version:=greatest(old.payable_structure_version,new.payable_structure_version); end if;
 return new;
end $$;
create trigger supplier_part_structure_revision before update on supplier_purchases for each row execute function supplier_part_structure_revision();
create function supplier_part_event_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare changed boolean:=false; before_parts jsonb; after_parts jsonb;
begin
 if tg_table_name='supplier_bill_events' then
  if new.after_data->>'status'='Conciliado' then changed:=true;
  elsif new.after_data->>'status'='Anulado' then changed:=new.before_data->>'status'='Conciliado'; end if;
 else
  select coalesce(jsonb_agg(jsonb_build_array((x->>'number')::integer,(x->>'amount')::numeric) order by (x->>'number')::integer),jsonb_build_array(jsonb_build_array(1,(new.before_value#>>'{bill,declared_total}')::numeric))) into before_parts from jsonb_array_elements(new.before_value->'installments') x;
  select coalesce(jsonb_agg(jsonb_build_array((x->>'number')::integer,(x->>'amount')::numeric) order by (x->>'number')::integer),jsonb_build_array(jsonb_build_array(1,(new.before_value#>>'{bill,declared_total}')::numeric))) into after_parts from jsonb_array_elements(new.after_value->'installments') x;
  changed:=before_parts is distinct from after_parts;
 end if;
 if changed then
  update supplier_purchases p set payable_structure_version=payable_structure_version+1 where p.document_type is distinct from 'Nota de Crédito' and p.purchase_reception_id in
   (select i.purchase_reception_id from supplier_bill_lines l join purchase_reception_items i on i.id=l.receipt_item_id where l.bill_id=new.bill_id);
 end if;
 return null;
end $$;
create trigger supplier_parts_bill_event after insert on supplier_bill_events for each row execute function supplier_part_event_revision();
create trigger supplier_parts_schedule_event after insert on supplier_bill_schedule_events for each row execute function supplier_part_event_revision();
create function supplier_part_scope_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare supplier uuid:=coalesce(new.supplier_id,old.supplier_id);
begin
 if tg_op='UPDATE' then
  if tg_table_name='supplier_account_starts' then
   if new.start_date=old.start_date then return null; end if;
  else
   if new.included=old.included then return null; end if;
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 update supplier_purchases p set payable_structure_version=payable_structure_version+1 where p.supplier_id=supplier and exists(select 1 from supplier_payable_application_details d where d.purchase_id=p.id);
 return null;
end $$;
create trigger supplier_parts_start_revision after insert or update or delete on supplier_account_starts for each row execute function supplier_part_scope_revision();
create trigger supplier_parts_history_revision after insert or update or delete on supplier_account_history for each row execute function supplier_part_scope_revision();

create function supplier_item_source_allocations(p_payment uuid,p_credit uuid)
returns table(purchase_id uuid,amount numeric) language sql stable security definer set search_path=public,pg_temp as $$
 select a.purchase_id,a.amount from supplier_payment_allocations a join supplier_payments p on p.id=a.payment_id where p.id=p_payment and p.reversed_at is null
 union all select p.purchase_id,p.amount from supplier_payments p where p.id=p_payment and p.reversed_at is null and p.purchase_id is not null and not exists(select 1 from supplier_payment_allocations a where a.payment_id=p.id)
 union all select a.purchase_id,a.amount from supplier_credit_allocations a join supplier_purchases c on c.id=a.credit_id where c.id=p_credit and c.status<>'Anulado' and c.document_type='Nota de Crédito'
$$;
create function supplier_item_source_signature(p_payment uuid,p_credit uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select case when p_payment is not null then supplier_payment_application_signature(p_payment) else supplier_credit_signature(p_credit) end
$$;
create function supplier_item_layout_signature(p_purchase uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select md5(p.payable_structure_version::text||coalesce((select jsonb_agg(jsonb_build_array(i.item_key,i.amount,i.supplier_id,i.currency) order by i.item_key)::text from supplier_payable_base_items i where i.purchase_id=p.id),'[]')) from supplier_purchases p where p.id=p_purchase
$$;
create function supplier_item_source_in_scope(p_payment uuid,p_credit uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from supplier_account_entries e join supplier_account_starts s on s.supplier_id=e.supplier_id
  left join supplier_account_history h on h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id
  where e.source=case when p_payment is not null then 'payment' else 'purchase' end and e.source_id=coalesce(p_payment,p_credit)
   and not e.voided and coalesce(h.included,e.entry_date>=s.start_date))
$$;
create view supplier_effective_item_applications as
 select d.* from supplier_payable_application_details d join supplier_payable_base_items b on b.item_key=d.item_key and b.purchase_id=d.purchase_id
 where d.source_signature=supplier_item_source_signature(d.payment_id,d.credit_id) and d.layout_signature=supplier_item_layout_signature(d.purchase_id)
  and b.included and supplier_item_source_in_scope(d.payment_id,d.credit_id);
create view supplier_payable_items as
with totals as (select purchase_id,sum(amount) amount from supplier_effective_item_applications group by purchase_id),
 specific as (select item_key,sum(amount) amount from supplier_effective_item_applications group by item_key)
select b.item_key,b.purchase_id,b.bill_id,b.installment_number,b.reference,b.document_type,b.document_condition,b.entry_date,b.due_date,b.amount,
 b.supplier_id,b.currency,b.document_total,b.cash_applied,b.credit_applied,b.included,b.part_count,
 case when b.cash_applied+b.credit_applied>=b.document_total then 0
  when b.part_count=1 then greatest(0,b.amount-b.cash_applied-b.credit_applied)
  when coalesce(t.amount,0)=b.cash_applied+b.credit_applied then greatest(0,b.amount-coalesce(s.amount,0)) else null end::numeric(15,2) pending_amount,
 (b.part_count>1 and b.cash_applied+b.credit_applied>0 and b.cash_applied+b.credit_applied<b.document_total and coalesce(t.amount,0)<>b.cash_applied+b.credit_applied) needs_allocation,
 coalesce(s.amount,0)::numeric(15,2) item_applied_amount
from supplier_payable_base_items b left join totals t on t.purchase_id=b.purchase_id left join specific s on s.item_key=b.item_key;

create function supplier_item_distribution_signature(p_payment uuid,p_credit uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select md5(coalesce(supplier_item_source_signature(p_payment,p_credit),'')||
 coalesce((select jsonb_agg(jsonb_build_array(a.purchase_id,a.amount,supplier_item_layout_signature(a.purchase_id)) order by a.purchase_id)::text from supplier_item_source_allocations(p_payment,p_credit) a),'[]')||
 coalesce((select jsonb_agg(to_jsonb(d) order by d.item_key)::text from supplier_payable_application_details d where d.payment_id=p_payment or d.credit_id=p_credit),'[]'))
$$;
create function assign_supplier_item_details(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare payment uuid:=nullif(p_payload->>'paymentId','')::uuid; credit uuid:=nullif(p_payload->>'creditId','')::uuid;
 prior supplier_payable_application_events; before_value jsonb; result jsonb; item jsonb; target record; value numeric; supplier uuid; currency text;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para distribuir aplicaciones.' using errcode='42501'; end if;
 if num_nonnulls(payment,credit)<>1 or p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000
  or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>500 then raise exception 'Distribución inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-item:'||p_request::text,0));
 select * into prior from supplier_payable_application_events where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505'; end if;
  return prior.after_value;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 if payment is not null then select supplier_id,supplier_payments.currency into strict supplier,currency from supplier_payments where id=payment for update;
 else select supplier_id,supplier_purchases.currency into strict supplier,currency from supplier_purchases where id=credit and document_type='Nota de Crédito' for update; end if;
 perform 1 from supplier_purchases p where p.id in(select a.purchase_id from supplier_item_source_allocations(payment,credit) a) order by p.id for update;
 if supplier_item_distribution_signature(payment,credit) is distinct from p_payload->>'signature' then raise exception 'Las aplicaciones o las partidas cambiaron. Actualizá la vista.' using errcode='40001'; end if;
 if jsonb_array_length(p_payload->'items')>0 then
  if not supplier_item_source_in_scope(payment,credit) then raise exception 'El origen está fuera del saldo vigente.'; end if;
  if (select count(*)<>count(distinct x->>'itemKey') from jsonb_array_elements(p_payload->'items') x) then raise exception 'No repitas partidas.'; end if;
  for item in select x from jsonb_array_elements(p_payload->'items') x loop
   value:=(item->>'amount')::numeric;
   if value is null or value<=0 or value<>round(value,2) or value>=1000000000000 then raise exception 'Importe de partida inválido.'; end if;
   select * into strict target from supplier_payable_base_items where item_key=item->>'itemKey';
   if not target.included or target.supplier_id<>supplier or target.currency<>currency or not exists(select 1 from supplier_item_source_allocations(payment,credit) a where a.purchase_id=target.purchase_id) then raise exception 'Partida ajena a las aplicaciones del origen.'; end if;
   if value>target.amount-coalesce((select sum(d.amount) from supplier_effective_item_applications d where d.item_key=target.item_key and not(d.payment_id is not distinct from payment and d.credit_id is not distinct from credit)),0) then raise exception 'La partida no tiene importe disponible suficiente.'; end if;
  end loop;
  if exists(select 1 from supplier_item_source_allocations(payment,credit) a where a.amount is distinct from
   (select sum((x->>'amount')::numeric) from jsonb_array_elements(p_payload->'items') x join supplier_payable_base_items b on b.item_key=x->>'itemKey' where b.purchase_id=a.purchase_id)) then raise exception 'Distribuí exactamente el importe aplicado a cada documento.'; end if;
 end if;
 before_value:=jsonb_build_object('signature',supplier_item_distribution_signature(payment,credit),'details',coalesce((select jsonb_agg(to_jsonb(d) order by item_key) from supplier_payable_application_details d where d.payment_id=payment or d.credit_id=credit),'[]'));
 delete from supplier_payable_application_details d where d.payment_id=payment or d.credit_id=credit;
 insert into supplier_payable_application_details(payment_id,credit_id,purchase_id,item_key,amount,source_signature,layout_signature)
 select payment,credit,b.purchase_id,b.item_key,(x->>'amount')::numeric,supplier_item_source_signature(payment,credit),supplier_item_layout_signature(b.purchase_id)
 from jsonb_array_elements(p_payload->'items') x join supplier_payable_base_items b on b.item_key=x->>'itemKey';
 result:=jsonb_build_object('signature',supplier_item_distribution_signature(payment,credit),'items',p_payload->'items');
 insert into supplier_payable_application_events(payment_id,credit_id,actor_id,request_id,payload,before_value,after_value) values(payment,credit,p_actor,p_request,p_payload,before_value,result);
 return result;
end $$;
create function get_supplier_item_distribution(p_payment uuid,p_credit uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'source',case when p_payment is not null then (select jsonb_build_object('kind','payment','id',p.id,'amount',p.amount,'currency',p.currency,'reference',coalesce(t.movement_code,'Pago registrado'),'created_at',coalesce(t.created_at,p.created_at),'included',supplier_item_source_in_scope(p.id,null)) from supplier_payments p left join cash_transactions t on t.id=p.cash_transaction_id where p.id=p_payment)
   else (select jsonb_build_object('kind','credit','id',c.id,'amount',c.total_amount,'currency',c.currency,'reference',c.invoice_number,'created_at',coalesce(c.purchase_date,c.created_at),'included',supplier_item_source_in_scope(null,c.id)) from supplier_purchases c where c.id=p_credit and c.document_type='Nota de Crédito') end,
  'signature',supplier_item_distribution_signature(p_payment,p_credit),
  'budgets',coalesce((select jsonb_agg(jsonb_build_object('purchase_id',a.purchase_id,'amount',a.amount,'reference',p.invoice_number) order by a.purchase_id) from supplier_item_source_allocations(p_payment,p_credit) a join supplier_purchases p on p.id=a.purchase_id),'[]'),
  'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('available_for_source',i.amount-coalesce((select sum(d.amount) from supplier_effective_item_applications d where d.item_key=i.item_key and not(d.payment_id is not distinct from p_payment and d.credit_id is not distinct from p_credit)),0)) order by i.purchase_id,i.installment_number,i.item_key) from supplier_payable_items i where i.purchase_id in(select purchase_id from supplier_item_source_allocations(p_payment,p_credit))),'[]'),
  'details',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('valid',exists(select 1 from supplier_effective_item_applications v where v.id=d.id)) order by item_key) from supplier_payable_application_details d where d.payment_id=p_payment or d.credit_id=p_credit),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select id,payload,created_at from supplier_payable_application_events where payment_id=p_payment or credit_id=p_credit order by created_at desc limit 100) e),'[]')
 )
$$;
revoke all on supplier_payable_base_items,supplier_effective_item_applications,supplier_payable_items from public,anon,authenticated;
grant select on supplier_payable_base_items,supplier_effective_item_applications,supplier_payable_items to service_role;
revoke all on function supplier_item_source_allocations(uuid,uuid),supplier_item_source_signature(uuid,uuid),supplier_item_layout_signature(uuid),supplier_item_source_in_scope(uuid,uuid),supplier_item_distribution_signature(uuid,uuid),assign_supplier_item_details(uuid,uuid,jsonb),get_supplier_item_distribution(uuid,uuid) from public,anon,authenticated;
grant execute on function supplier_item_source_allocations(uuid,uuid),supplier_item_source_signature(uuid,uuid),supplier_item_layout_signature(uuid),supplier_item_source_in_scope(uuid,uuid),supplier_item_distribution_signature(uuid,uuid),assign_supplier_item_details(uuid,uuid,jsonb),get_supplier_item_distribution(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
