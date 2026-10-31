begin;
-- Existing OCs have no currency. Keep them unknown until explicitly confirmed.
alter table purchase_orders add column if not exists currency text;
alter table purchase_orders add constraint supplier_order_currency check(currency in ('ARS','USD'));
create table public.supplier_payment_reservations (
 payment_id uuid not null references supplier_payments(id),order_id uuid not null references purchase_orders(id),
 amount numeric(15,2) not null check(amount>0 and amount<1000000000000),primary key(payment_id,order_id)
);
create table public.supplier_reservation_events (
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references supplier_payments(id),actor_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null,before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table supplier_payment_reservations enable row level security;alter table supplier_reservation_events enable row level security;
revoke all on supplier_payment_reservations,supplier_reservation_events from public,anon,authenticated;
grant all on supplier_payment_reservations to service_role;grant select,insert on supplier_reservation_events to service_role;
create function public.supplier_reserved_amount(p_key text) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$select coalesce(sum(amount),0) from supplier_payment_reservations where 'payment:'||payment_id=p_key$$;
create function public.supplier_source_encumbered(p_key text) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$select supplier_opening_source_used(p_key)+supplier_reserved_amount(p_key)$$;
create function public.supplier_reservation_signature(p_payment uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
select md5(supplier_payment_application_signature(p_payment)||coalesce((select jsonb_agg(to_jsonb(r) order by order_id)::text from supplier_payment_reservations r where payment_id=p_payment),'[]')
 ||(select count(*)::text from supplier_reservation_events where payment_id=p_payment))
$$;
create function public.get_supplier_reservations(p_payment uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object('source',to_jsonb(s),'signature',supplier_reservation_signature(p_payment),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'reference',o.oc_code,'currency',o.currency,'status',o.status) order by o.id) from purchase_orders o where o.supplier_id=s.supplier_id and (o.currency is null or o.currency=s.currency) and coalesce(o.status,'') not ilike 'cancel%'),'[]'),
 'reservations',coalesce((select jsonb_agg(to_jsonb(r) order by order_id) from supplier_payment_reservations r where payment_id=p_payment),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from (select id,created_at,payload->>'reason' reason from supplier_reservation_events where payment_id=p_payment order by created_at desc,id desc limit 30)e),'[]'))
from supplier_opening_sources s where s.source_key='payment:'||p_payment
$$;
create function public.save_supplier_reservations(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p supplier_payments;s record;o record;i jsonb;value numeric;total numeric:=0;prior supplier_reservation_events;before_value jsonb;result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para reservar anticipos.' using errcode='42501';end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000 or jsonb_typeof(p_payload->'reservations') is distinct from 'array' or jsonb_array_length(p_payload->'reservations')>100 then raise exception 'Reserva inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-reservation:'||p_request::text,0));
 select * into prior from supplier_reservation_events where actor_id=p_actor and request_id=p_request;
 if found then if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505';end if;return prior.after_value;end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict p from supplier_payments where id=(p_payload->>'paymentId')::uuid for update;
 select * into strict s from supplier_opening_sources where source_key='payment:'||p.id;
 if supplier_reservation_signature(p.id) is distinct from p_payload->>'signature' then raise exception 'El anticipo cambió. Actualizá la vista.' using errcode='40001';end if;
 if not s.included and jsonb_array_length(p_payload->'reservations')>0 then raise exception 'El pago está fuera del saldo vigente.';end if;
 if (select count(*)<>count(distinct x->>'orderId') from jsonb_array_elements(p_payload->'reservations')x) then raise exception 'No repitas órdenes.';end if;
 perform 1 from purchase_orders where id in(select (x->>'orderId')::uuid from jsonb_array_elements(p_payload->'reservations')x) order by id for update;
 before_value:=get_supplier_reservations(p.id);
 for i in select x from jsonb_array_elements(p_payload->'reservations')x loop
  value:=(i->>'amount')::numeric;if value is null or value<=0 or value<>round(value,2) or value>=1000000000000 then raise exception 'Importe de reserva inválido.';end if;
  select * into strict o from purchase_orders where id=(i->>'orderId')::uuid;
  if o.currency is null then
   if coalesce((p_payload->>'confirmOrderCurrency')::boolean,false) is not true then raise exception 'La OC no tiene moneda informada. Confirmala antes de reservar el anticipo.';end if;
   update purchase_orders set currency=p.currency where id=o.id;o.currency:=p.currency;
  end if;
  if o.supplier_id<>p.supplier_id or o.currency<>p.currency or coalesce(o.status,'') ilike 'cancel%' then raise exception 'La OC no pertenece al proveedor/moneda o está cancelada.';end if;total:=total+value;
 end loop;
 if total+s.document_applied+s.opening_applied>p.amount then raise exception 'La reserva supera el anticipo libre de aplicaciones.';end if;
 delete from supplier_payment_reservations where payment_id=p.id;
 insert into supplier_payment_reservations select p.id,(x->>'orderId')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_payload->'reservations')x;
 result:=jsonb_build_object('paymentId',p.id,'reserved',total,'available',p.amount-s.document_applied-s.opening_applied-total,'reservations',p_payload->'reservations');
 insert into supplier_reservation_events(payment_id,actor_id,request_id,payload,before_value,after_value) values(p.id,p_actor,p_request,p_payload,before_value,result);
 update financial_operations set version=version+1,updated_at=clock_timestamp() where id in(select c.operation_id from cash_transactions c where c.id=p.cash_transaction_id);
 return result;
end $$;
create function public.guard_supplier_reserved_order() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 if exists(select 1 from supplier_payment_reservations where order_id=old.id) then
  if tg_op='DELETE' then raise exception 'Liberá las reservas de anticipos antes de eliminar la OC.';end if;
  if new.supplier_id is distinct from old.supplier_id or new.currency is distinct from old.currency or coalesce(new.status,'') ilike 'cancel%' then raise exception 'Liberá las reservas de anticipos antes de modificar o cancelar la OC.';end if;
 end if;if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger supplier_reserved_order_guard before update or delete on purchase_orders for each row execute function guard_supplier_reserved_order();
create function public.guard_supplier_order_currency() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare order_currency text;receipt_currency text;
begin
 if tg_table_name='purchase_orders' then
  if new.currency is distinct from old.currency and new.currency is not null and exists(select 1 from purchase_receptions r where (r.purchase_order_id=new.id or exists(select 1 from purchase_reception_orders l where l.purchase_reception_id=r.id and l.purchase_order_id=new.id)) and r.currency is distinct from new.currency) then raise exception 'La moneda de la OC no coincide con sus recepciones. Revisá el historial antes de cambiarla.';end if;
 elsif tg_table_name='purchase_receptions' then
  select currency into order_currency from purchase_orders where id=new.purchase_order_id;
  if order_currency is not null and new.currency is distinct from order_currency then raise exception 'La recepción debe usar la moneda confirmada de la OC.';end if;
 else
  select currency into order_currency from purchase_orders where id=new.purchase_order_id;
  select currency into receipt_currency from purchase_receptions where id=new.purchase_reception_id;
  if order_currency is not null and receipt_currency is distinct from order_currency then raise exception 'No se pueden agrupar OCs de otra moneda en la recepción.';end if;
 end if;return new;
end $$;
create trigger supplier_order_currency_guard before update of currency on purchase_orders for each row execute function guard_supplier_order_currency();
create trigger supplier_receipt_order_currency before insert or update of currency,purchase_order_id on purchase_receptions for each row execute function guard_supplier_order_currency();
create trigger supplier_receipt_link_currency before insert or update on purchase_reception_orders for each row execute function guard_supplier_order_currency();
create function public.guard_supplier_reservation_scope() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 if exists(select 1 from supplier_payment_reservations r join supplier_payments p on p.id=r.payment_id left join supplier_opening_sources s on s.source_key='payment:'||p.id
  where p.supplier_id=coalesce(new.supplier_id,old.supplier_id) and (s.source_key is null or not s.included)) then raise exception 'Liberá las reservas de anticipos antes de excluir su pago o cambiar el punto de partida.';end if;return null;
end $$;
create trigger supplier_reservation_history_scope after insert or update or delete on supplier_account_history for each row execute function guard_supplier_reservation_scope();
create trigger supplier_reservation_start_scope after insert or update or delete on supplier_account_starts for each row execute function guard_supplier_reservation_scope();
do $patch$
declare definition text;anchor text;
begin
 select pg_get_functiondef('reapply_supplier_payment(uuid,uuid,jsonb)'::regprocedure) into definition;
 execute replace(definition,'supplier_opening_source_used(''payment:''||payment.id)','supplier_source_encumbered(''payment:''||payment.id)');
 select pg_get_functiondef('guard_supplier_opening_usage()'::regprocedure) into definition;
 definition:=replace(definition,'supplier_opening_source_used(''payment:''||origin)','supplier_source_encumbered(''payment:''||origin)');
 definition:=replace(definition,'supplier_opening_source_used(''payment:''||old.id)','supplier_source_encumbered(''payment:''||old.id)');
 execute replace(definition,'Liberá las aplicaciones a apertura antes de editar o anular el pago.','Liberá las aplicaciones a apertura y las reservas de anticipos antes de editar o anular el pago.');
 select pg_get_functiondef('save_supplier_opening_applications(uuid,uuid,jsonb)'::regprocedure) into definition;
 anchor:='total+s.document_applied>s.amount';if position(anchor in definition)=0 then raise exception 'Revisar integración de reserva con apertura.';end if;
 definition:=replace(definition,anchor,'total+s.document_applied+supplier_reserved_amount(s.source_key)>s.amount');
 execute replace(definition,'''available'',s.amount-s.document_applied-total','''available'',s.amount-s.document_applied-total-supplier_reserved_amount(s.source_key)');
 select pg_get_functiondef('get_supplier_opening_workspace(uuid)'::regprocedure) into definition;
 anchor:='''signature'',supplier_opening_application_signature(s.source_key)';if position(anchor in definition)=0 then raise exception 'Revisar lectura de reservas.';end if;
 execute replace(definition,anchor,anchor||',''reserved_amount'',supplier_reserved_amount(s.source_key)');
 select pg_get_functiondef('supplier_payment_application_signature(uuid)'::regprocedure) into definition;
 anchor:='md5(to_jsonb(p)::text';if position(anchor in definition)=0 then raise exception 'Revisar firma de anticipos.';end if;
 execute replace(definition,anchor,'md5(case when exists(select 1 from supplier_reservation_events where payment_id=p.id) then coalesce((select jsonb_agg(to_jsonb(r) order by order_id)::text from supplier_payment_reservations r where payment_id=p.id),''[]'')||(select count(*)::text from supplier_reservation_events where payment_id=p.id) else '''' end||to_jsonb(p)::text');
 select pg_get_functiondef('get_supplier_cutover_review(uuid,uuid)'::regprocedure) into definition;
 anchor:='''ready'',(result->>''ready'')::boolean and unused=0';if position(anchor in definition)=0 then raise exception 'Revisar bloqueo de corte con reservas.';end if;
 execute replace(definition,anchor,anchor||' and not exists(select 1 from supplier_payment_reservations r join supplier_payments p on p.id=r.payment_id where p.supplier_id=p_supplier),''reservedPayments'',(select count(distinct r.payment_id) from supplier_payment_reservations r join supplier_payments p on p.id=r.payment_id where p.supplier_id=p_supplier)');
end $patch$;
revoke all on function supplier_reserved_amount(text),supplier_source_encumbered(text),supplier_reservation_signature(uuid),get_supplier_reservations(uuid),save_supplier_reservations(uuid,uuid,jsonb),guard_supplier_reserved_order(),guard_supplier_reservation_scope(),guard_supplier_order_currency() from public,anon,authenticated;
grant execute on function supplier_reserved_amount(text),supplier_source_encumbered(text),supplier_reservation_signature(uuid),get_supplier_reservations(uuid),save_supplier_reservations(uuid,uuid,jsonb),guard_supplier_reserved_order(),guard_supplier_reservation_scope(),guard_supplier_order_currency() to service_role;
notify pgrst,'reload schema';
commit;
