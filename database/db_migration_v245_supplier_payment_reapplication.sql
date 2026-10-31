-- Redistributes an existing payment. Never inserts or updates cash movements.
begin;
create table public.supplier_payment_application_events (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.supplier_payments(id),
 actor_id uuid not null references auth.users(id), request_id uuid not null,
 payload jsonb not null, before_value jsonb not null, after_value jsonb not null,
 created_at timestamptz not null default now(), unique(actor_id,request_id)
);
alter table public.supplier_payment_application_events enable row level security;
revoke all on public.supplier_payment_application_events from public,anon,authenticated;
grant select,insert on public.supplier_payment_application_events to service_role;

create function public.supplier_payment_application_signature(p_payment uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(p)::text||coalesce((select jsonb_agg(to_jsonb(a) order by a.purchase_id,a.id)::text from supplier_payment_allocations a where a.payment_id=p.id),'[]')) from supplier_payments p where p.id=p_payment
$$;
create function public.supplier_purchase_cash_applied(p_purchase uuid,p_except uuid default null) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(amount),0) from (
  select a.amount from supplier_payment_allocations a join supplier_payments p on p.id=a.payment_id
   where a.purchase_id=p_purchase and p.reversed_at is null and p.id is distinct from p_except
  union all
  select p.amount from supplier_payments p where p.purchase_id=p_purchase and p.reversed_at is null and p.id is distinct from p_except
   and not exists(select 1 from supplier_payment_allocations a where a.payment_id=p.id)
 ) amounts
$$;
create function public.get_supplier_application_payments(p_supplier uuid)
returns table(id uuid,amount numeric,currency text,created_at timestamptz,cash_transaction_id uuid,signature text,allocations jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.amount,p.currency,coalesce(t.created_at,p.created_at),p.cash_transaction_id,supplier_payment_application_signature(p.id),
  case when exists(select 1 from supplier_payment_allocations a where a.payment_id=p.id)
   then (select jsonb_agg(jsonb_build_object('purchase_id',a.purchase_id,'amount',a.amount) order by a.purchase_id) from supplier_payment_allocations a where a.payment_id=p.id)
   when p.purchase_id is not null then jsonb_build_array(jsonb_build_object('purchase_id',p.purchase_id,'amount',p.amount)) else '[]'::jsonb end
 from supplier_payments p left join cash_transactions t on t.id=p.cash_transaction_id where p.supplier_id=p_supplier and p.reversed_at is null order by coalesce(t.created_at,p.created_at),p.id
$$;
create function public.get_supplier_application_documents(p_supplier uuid)
returns table(id uuid,invoice_number text,total_amount numeric,paid_amount numeric,currency text,status text,document_type text,purchase_date timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.invoice_number::text,p.total_amount,supplier_purchase_cash_applied(p.id),p.currency::text,p.status::text,p.document_type::text,p.purchase_date::timestamptz
 from supplier_purchases p where p.supplier_id=p_supplier order by p.id
$$;
create function public.reapply_supplier_payment(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.supplier_payments; doc public.supplier_purchases; prior public.supplier_payment_application_events;
 old_value jsonb; result jsonb; applied numeric:=0; item jsonb; value numeric; touched uuid[]; doc_id uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para aplicar pagos.' using errcode='42501'; end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000
  or jsonb_typeof(p_payload->'allocations') is distinct from 'array' or jsonb_array_length(p_payload->'allocations')>100 then raise exception 'Aplicación inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-application:'||p_request::text,0));
 select * into prior from supplier_payment_application_events where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505'; end if;
  return prior.after_value;
 end if;
 -- Same serialization boundary as the existing financial editor.
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict payment from supplier_payments where id=(p_payload->>'paymentId')::uuid for update;
 if payment.reversed_at is not null then raise exception 'El pago está revertido.'; end if;
 if supplier_payment_application_signature(payment.id) is distinct from p_payload->>'signature' then raise exception 'El pago o sus aplicaciones cambiaron. Actualizá la vista.' using errcode='40001'; end if;
 if not exists(select 1 from supplier_account_starts where supplier_id=payment.supplier_id) then raise exception 'Configurá el punto de partida del proveedor antes de aplicar pagos.'; end if;
 if not exists(select 1 from supplier_account_entries e join supplier_account_starts s on s.supplier_id=e.supplier_id
   left join supplier_account_history h on h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id
   where e.source='payment' and e.source_id=payment.id and not e.voided and coalesce(h.included,e.entry_date>=s.start_date)) then raise exception 'El pago está fuera del saldo vigente. Conciliá su alcance antes de aplicar.'; end if;
 if exists(select 1 from cash_transactions t join financial_operations o on o.id=t.operation_id where t.id=payment.cash_transaction_id and o.status='cancelled') then raise exception 'La operación del pago está anulada.'; end if;
 old_value:=jsonb_build_object('payment',to_jsonb(payment),'allocations',(select allocations from get_supplier_application_payments(payment.supplier_id) where id=payment.id));
 if (select count(*)<>count(distinct x->>'purchase_id') from jsonb_array_elements(p_payload->'allocations') x) then raise exception 'No repitas documentos.'; end if;
 select coalesce(array_agg(distinct x),'{}') into touched from (
  select a.purchase_id x from supplier_payment_allocations a where a.payment_id=payment.id
  union select payment.purchase_id where payment.purchase_id is not null
  union select (x->>'purchase_id')::uuid from jsonb_array_elements(p_payload->'allocations') x
 ) ids;
 perform 1 from supplier_purchases where id=any(touched) order by id for update;
 for item in select x from jsonb_array_elements(p_payload->'allocations') x loop
  value:=(item->>'amount')::numeric;
  if value is null or value<=0 or value<>round(value,2) or value>999999999999 then raise exception 'Importe de aplicación inválido.'; end if;
  select * into strict doc from supplier_purchases where id=(item->>'purchase_id')::uuid;
  if doc.supplier_id<>payment.supplier_id or doc.currency<>payment.currency or doc.status='Anulado' or doc.document_type='Nota de Crédito'
   or value>round(doc.total_amount,2)-supplier_purchase_cash_applied(doc.id,payment.id) then raise exception 'Documento, moneda o pendiente inválidos.'; end if;
  if not exists(select 1 from supplier_account_entries e join supplier_account_starts s on s.supplier_id=e.supplier_id
    left join supplier_account_history h on h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id
    where e.source='purchase' and e.source_id=doc.id and not e.voided and coalesce(h.included,e.entry_date>=s.start_date)) then raise exception 'El documento está fuera del saldo vigente. Conciliá su alcance antes de aplicar.'; end if;
  applied:=applied+value;
 end loop;
 if applied>payment.amount then raise exception 'El total aplicado supera el pago.'; end if;
 perform set_config('zono.financial_write','on',true);
 delete from supplier_payment_allocations where payment_id=payment.id;
 update supplier_payments set purchase_id=null where id=payment.id;
 insert into supplier_payment_allocations(payment_id,purchase_id,amount)
 select payment.id,(x->>'purchase_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_payload->'allocations') x;
 foreach doc_id in array touched loop
  update supplier_purchases set paid_amount=supplier_purchase_cash_applied(doc_id),status=case
   when supplier_purchase_cash_applied(doc_id)>=round(total_amount,2) then 'Pagado'
   when supplier_purchase_cash_applied(doc_id)>0 then 'Parcial' else 'Pendiente' end
   where id=doc_id and status<>'Anulado' and document_type is distinct from 'Nota de Crédito';
 end loop;
 -- Invalidate an editor opened before this redistribution.
 update financial_operations set detail=jsonb_set(coalesce(detail,'{}'::jsonb),'{supplier_allocation_mode}','"documents"'::jsonb),version=version+1,updated_at=clock_timestamp()
  where id in(select operation_id from cash_transactions where id=payment.cash_transaction_id);
 result:=jsonb_build_object('paymentId',payment.id,'applied',applied,'available',payment.amount-applied,
  'signature',supplier_payment_application_signature(payment.id),'allocations',p_payload->'allocations');
 insert into supplier_payment_application_events(payment_id,actor_id,request_id,payload,before_value,after_value) values(payment.id,p_actor,p_request,p_payload,old_value,result);
 return result;
end $$;
revoke all on function public.supplier_payment_application_signature(uuid),public.supplier_purchase_cash_applied(uuid,uuid),public.get_supplier_application_payments(uuid),public.get_supplier_application_documents(uuid),public.reapply_supplier_payment(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.supplier_payment_application_signature(uuid),public.supplier_purchase_cash_applied(uuid,uuid),public.get_supplier_application_payments(uuid),public.get_supplier_application_documents(uuid),public.reapply_supplier_payment(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
