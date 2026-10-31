begin;
create table public.supplier_opening_applications (
 id uuid primary key default gen_random_uuid(),supplier_id uuid not null references suppliers(id),
 source_key text not null,target_key text not null,amount numeric(15,2) not null check(amount>0 and amount<1000000000000),
 unique(source_key,target_key),check(source_key<>target_key)
);
create index supplier_opening_application_target on supplier_opening_applications(target_key);
create table public.supplier_opening_application_events (
 id uuid primary key default gen_random_uuid(),supplier_id uuid not null references suppliers(id),source_key text not null,
 actor_id uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,
 before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table supplier_opening_applications enable row level security;
alter table supplier_opening_application_events enable row level security;
revoke all on supplier_opening_applications,supplier_opening_application_events from public,anon,authenticated;
grant all on supplier_opening_applications to service_role;
grant select,insert on supplier_opening_application_events to service_role;

create view public.supplier_opening_parts as
select 'opening:'||i.supplier_id||':'||i.currency||':'||i.number item_key,i.supplier_id,i.number,i.currency,i.amount,i.reference,i.document_condition,i.document_date,i.due_date,i.evidence
from supplier_opening_items i
union all
select 'opening:'||s.supplier_id||':'||c.currency||':0',s.supplier_id,0,c.currency,c.amount,'Saldo inicial sin detalle','sin_detalle',s.start_date,null::date,s.notes
from supplier_account_starts s cross join lateral(values('ARS',s.opening_ars),('USD',s.opening_usd)) c(currency,amount)
where c.amount<>0 and not exists(select 1 from supplier_opening_items i where i.supplier_id=s.supplier_id);

create function public.supplier_opening_source_used(p_key text) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(amount),0) from supplier_opening_applications where source_key=p_key
$$;
-- Include initial credit settlements in every existing document-pending calculation.
create or replace function public.supplier_purchase_credit_applied(p_purchase uuid,p_except uuid default null) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(amount) from supplier_credit_allocations where purchase_id=p_purchase and credit_id is distinct from p_except),0)
 +coalesce((select sum(amount) from supplier_opening_applications where target_key='purchase:'||p_purchase),0)
$$;
create or replace function public.supplier_payment_application_signature(p_payment uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(p)::text||coalesce((select jsonb_agg(to_jsonb(a) order by a.purchase_id,a.id)::text from supplier_payment_allocations a where a.payment_id=p.id),'[]')
 ||coalesce((select jsonb_agg(to_jsonb(a) order by a.id)::text from supplier_opening_applications a where a.source_key='payment:'||p.id),'[]')
 ||(select count(*)::text from supplier_opening_application_events e where e.source_key='payment:'||p.id)) from supplier_payments p where p.id=p_payment
$$;
create or replace function public.supplier_credit_signature(p_credit uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(p)::text||coalesce((select jsonb_agg(to_jsonb(a) order by a.purchase_id,a.id)::text from supplier_credit_allocations a where a.credit_id=p.id),'[]')
 ||coalesce((select jsonb_agg(to_jsonb(a) order by a.id)::text from supplier_opening_applications a where a.source_key='credit:'||p.id),'[]')
 ||(select count(*)::text from supplier_opening_application_events e where e.source_key='credit:'||p.id)) from supplier_purchases p where p.id=p_credit
$$;
create view public.supplier_opening_positions as
select p.*,case when p.amount>0 then p.amount-coalesce((select sum(a.amount) from supplier_opening_applications a where a.target_key=p.item_key),0)
 else p.amount+supplier_opening_source_used(p.item_key) end::numeric(15,2) pending_amount
from supplier_opening_parts p;

create function public.supplier_opening_payment_document_used(p_payment uuid) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select case when exists(select 1 from supplier_payment_allocations where payment_id=p.id)
 then (select coalesce(sum(amount),0) from supplier_payment_allocations where payment_id=p.id)
 when p.purchase_id is not null then p.amount else 0 end from supplier_payments p where p.id=p_payment
$$;
create view public.supplier_opening_sources as
select 'payment:'||p.id source_key,p.supplier_id,p.currency,p.amount,
 supplier_opening_payment_document_used(p.id) document_applied,supplier_opening_source_used('payment:'||p.id) opening_applied,
 coalesce(nullif(p.notes,''),'Pago') reference,'payment'::text kind,
 exists(select 1 from supplier_account_entries e join supplier_account_starts s on s.supplier_id=e.supplier_id
 left join supplier_account_history h on h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id
 where e.source='payment' and e.source_id=p.id and not e.voided and coalesce(h.included,e.entry_date>=s.start_date)) included
from supplier_payments p left join cash_transactions t on t.id=p.cash_transaction_id where p.reversed_at is null
union all
select 'credit:'||p.id,p.supplier_id,p.currency,p.total_amount,
 coalesce((select sum(amount) from supplier_credit_allocations where credit_id=p.id),0),supplier_opening_source_used('credit:'||p.id),
 coalesce(p.invoice_number,'Nota de crédito'),'credit',supplier_document_in_account(p.id)
from supplier_purchases p where p.document_type='Nota de Crédito' and p.status<>'Anulado' and p.total_amount>0
union all
select p.item_key,p.supplier_id,p.currency,-p.amount,0,supplier_opening_source_used(p.item_key),p.reference,'opening',true
from supplier_opening_parts p where p.amount<0;
create function public.supplier_opening_application_signature(p_source text) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(s)::text||coalesce((select jsonb_agg(to_jsonb(a) order by a.id)::text from supplier_opening_applications a where a.source_key=p_source),'[]')
 ||coalesce((select supplier_opening_signature(s.supplier_id)),'')
 ||(select count(*)::text from supplier_opening_application_events e where e.source_key=p_source)
 ||case when s.kind='payment' then supplier_payment_application_signature(split_part(p_source,':',2)::uuid)
 when s.kind='credit' then supplier_credit_signature(split_part(p_source,':',2)::uuid) else '' end)
 from supplier_opening_sources s where s.source_key=p_source
$$;

-- Older editors may continue working, but cannot reuse amounts settled against opening.
create function public.guard_supplier_opening_usage() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare used numeric;total numeric;origin uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 if tg_table_name='supplier_payment_allocations' then
  origin:=new.payment_id;used:=supplier_opening_source_used('payment:'||origin);
  if used>0 then
   select amount into total from supplier_payments where id=origin for update;
   if used+new.amount+coalesce((select sum(a.amount) from supplier_payment_allocations a where a.payment_id=origin and a.id is distinct from new.id),0)>total then raise exception 'El pago ya tiene importes aplicados a la apertura. Liberalos antes de redistribuir.'; end if;
  end if;return new;
 elsif tg_table_name='supplier_credit_allocations' then
  used:=supplier_opening_source_used('credit:'||new.credit_id);
  if used>0 then
   select total_amount into total from supplier_purchases where id=new.credit_id for update;
   if used+new.amount+coalesce((select sum(a.amount) from supplier_credit_allocations a where a.credit_id=new.credit_id and a.id is distinct from new.id),0)>total then raise exception 'La nota de crédito ya tiene importes aplicados a la apertura.'; end if;
  end if;return new;
 elsif tg_table_name='supplier_payments' then
  used:=supplier_opening_source_used('payment:'||old.id);
  if used>0 then
   if tg_op='DELETE' then raise exception 'Liberá las aplicaciones a apertura antes de eliminar el pago.';end if;
   if new.amount is distinct from old.amount or new.currency is distinct from old.currency or new.supplier_id is distinct from old.supplier_id or new.reversed_at is distinct from old.reversed_at or new.cash_transaction_id is distinct from old.cash_transaction_id
    or new.purchase_id is not null then raise exception 'Liberá las aplicaciones a apertura antes de editar o anular el pago.';end if;
  end if;
 elsif tg_table_name='supplier_purchases' then
  used:=supplier_opening_source_used('credit:'||old.id);
  if used>0 then
   if tg_op='DELETE' then raise exception 'Liberá las aplicaciones a apertura antes de eliminar el crédito.';end if;
   if new.status='Anulado' or new.document_type is distinct from old.document_type or new.total_amount is distinct from old.total_amount or new.currency is distinct from old.currency or new.supplier_id is distinct from old.supplier_id then raise exception 'Liberá las aplicaciones a apertura antes de editar el crédito.';end if;
  end if;
 elsif tg_table_name in ('supplier_opening_items','supplier_account_starts') then
  if exists(select 1 from supplier_opening_applications where supplier_id=coalesce(new.supplier_id,old.supplier_id)) then
   if tg_table_name='supplier_opening_items' or tg_op='DELETE' then raise exception 'Liberá las aplicaciones de apertura antes de modificar su composición.';end if;
   if new.start_date is distinct from old.start_date or new.opening_ars is distinct from old.opening_ars or new.opening_usd is distinct from old.opening_usd then raise exception 'Liberá las aplicaciones de apertura antes de cambiar el punto de partida.';end if;
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger supplier_opening_payment_guard before update or delete on supplier_payments for each row execute function guard_supplier_opening_usage();
create trigger supplier_opening_credit_guard before update or delete on supplier_purchases for each row execute function guard_supplier_opening_usage();
create trigger supplier_opening_payment_budget before insert or update on supplier_payment_allocations for each row execute function guard_supplier_opening_usage();
create trigger supplier_opening_credit_budget before insert or update on supplier_credit_allocations for each row execute function guard_supplier_opening_usage();
create trigger supplier_opening_composition_guard before insert or update or delete on supplier_opening_items for each row execute function guard_supplier_opening_usage();
create trigger supplier_opening_start_usage before update or delete on supplier_account_starts for each row execute function guard_supplier_opening_usage();
create function public.guard_supplier_opening_scope() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 if exists(select 1 from supplier_opening_applications a left join supplier_opening_sources s on s.source_key=a.source_key
  where a.supplier_id=coalesce(new.supplier_id,old.supplier_id) and (s.source_key is null or not s.included
  or (a.target_key like 'purchase:%' and not supplier_document_in_account(split_part(a.target_key,':',2)::uuid)))) then
  raise exception 'Liberá las aplicaciones de apertura antes de excluir sus documentos.';
 end if;return null;
end $$;
create trigger supplier_opening_history_scope after insert or update or delete on supplier_account_history for each row execute function guard_supplier_opening_scope();
create trigger supplier_opening_purchase_scope after update on supplier_purchases for each row execute function guard_supplier_opening_scope();

create function public.save_supplier_opening_applications(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s record;t record;i jsonb;value numeric;total numeric:=0;prior supplier_opening_application_events;before_value jsonb;result jsonb;target text;purchase uuid;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para aplicar a apertura.' using errcode='42501';end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000 or jsonb_typeof(p_payload->'allocations') is distinct from 'array' or jsonb_array_length(p_payload->'allocations')>500 then raise exception 'Aplicación inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':opening-application:'||p_request::text,0));
 select * into prior from supplier_opening_application_events where actor_id=p_actor and request_id=p_request;
 if found then if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505';end if;return prior.after_value;end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict s from supplier_opening_sources where source_key=p_payload->>'sourceKey';
 perform 1 from supplier_account_starts where supplier_id=s.supplier_id for update;
 if supplier_opening_application_signature(s.source_key) is distinct from p_payload->>'signature' then raise exception 'El origen o la apertura cambiaron. Actualizá la vista.' using errcode='40001';end if;
 if not s.included and jsonb_array_length(p_payload->'allocations')>0 then raise exception 'El origen está fuera del saldo vigente.';end if;
 if (select count(*)<>count(distinct x->>'targetKey') from jsonb_array_elements(p_payload->'allocations') x) then raise exception 'No repitas partidas.';end if;
 before_value:=jsonb_build_object('source',to_jsonb(s),'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by target_key) from supplier_opening_applications a where a.source_key=s.source_key),'[]'));
 for i in select x from jsonb_array_elements(p_payload->'allocations') x loop
  value:=(i->>'amount')::numeric;target:=i->>'targetKey';
  if value is null or value<=0 or value<>round(value,2) or value>=1000000000000 then raise exception 'Importe de aplicación inválido.';end if;
  if target like 'opening:%' then
   select * into strict t from supplier_opening_parts where item_key=target;
   if t.supplier_id<>s.supplier_id or t.currency<>s.currency or t.amount<=0 or value>t.amount-coalesce((select sum(a.amount) from supplier_opening_applications a where a.target_key=target and a.source_key<>s.source_key),0) then raise exception 'Partida, moneda o pendiente inválidos.';end if;
  elsif target like 'purchase:%' and s.kind='opening' then
   purchase:=substring(target from 10)::uuid;
   select * into strict t from supplier_purchases where id=purchase for update;
   if t.supplier_id<>s.supplier_id or t.currency<>s.currency or t.status='Anulado' or t.document_type='Nota de Crédito' or not supplier_document_in_account(t.id)
    or value>round(t.total_amount,2)-supplier_purchase_cash_applied(t.id)-supplier_purchase_credit_applied(t.id)+coalesce((select sum(a.amount) from supplier_opening_applications a where a.source_key=s.source_key and a.target_key=target),0) then raise exception 'Documento, moneda o pendiente inválidos.';end if;
  else raise exception 'Destino de apertura inválido.';end if;
  total:=total+value;
 end loop;
 if total+s.document_applied>s.amount then raise exception 'El total aplicado supera el origen disponible, incluidas sus aplicaciones a documentos.';end if;
 delete from supplier_opening_applications where source_key=s.source_key;
 insert into supplier_opening_applications(supplier_id,source_key,target_key,amount) select s.supplier_id,s.source_key,x->>'targetKey',(x->>'amount')::numeric from jsonb_array_elements(p_payload->'allocations') x;
 -- Only initial credits can target purchases. Refresh their existing noncash cache.
 for target in select distinct a->>'target_key' from jsonb_array_elements(before_value->'allocations') a where a->>'target_key' like 'purchase:%'
  union select x->>'targetKey' from jsonb_array_elements(p_payload->'allocations') x where x->>'targetKey' like 'purchase:%' loop
  purchase:=substring(target from 10)::uuid;update supplier_purchases set credit_applied_amount=supplier_purchase_credit_applied(purchase) where id=purchase;
 end loop;
 result:=jsonb_build_object('sourceKey',s.source_key,'applied',total,'available',s.amount-s.document_applied-total,'allocations',p_payload->'allocations');
 insert into supplier_opening_application_events(supplier_id,source_key,actor_id,request_id,payload,before_value,after_value) values(s.supplier_id,s.source_key,p_actor,p_request,p_payload,before_value,result);
 if s.kind='payment' then update financial_operations set version=version+1,updated_at=clock_timestamp() where id in(select cash.operation_id from supplier_payments p join cash_transactions cash on cash.id=p.cash_transaction_id where 'payment:'||p.id=s.source_key);end if;
 return result;
end $$;
create function public.get_supplier_opening_workspace(p_supplier uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
 'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.item_key) from supplier_opening_positions p where supplier_id=p_supplier),'[]'),
 'sources',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('signature',supplier_opening_application_signature(s.source_key)) order by s.source_key) from supplier_opening_sources s where supplier_id=p_supplier),'[]'),
 'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by source_key,target_key) from supplier_opening_applications a where supplier_id=p_supplier),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('item_key','purchase:'||p.id,'reference',p.invoice_number,'currency',p.currency,'pending_amount',greatest(0,p.total_amount-supplier_purchase_cash_applied(p.id)-supplier_purchase_credit_applied(p.id)),'included',supplier_document_in_account(p.id)) order by p.id) from supplier_purchases p where p.supplier_id=p_supplier and p.status<>'Anulado' and p.document_type is distinct from 'Nota de Crédito' and p.total_amount>0),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from (select id,source_key,created_at,payload->>'reason' reason from supplier_opening_application_events where supplier_id=p_supplier order by created_at desc,id desc limit 50)e),'[]'))
$$;
-- Existing reapplication APIs subtract opening consumption in addition to parent documents.
do $patch$
declare definition text;anchor text;
begin
 select pg_get_functiondef('reapply_supplier_payment(uuid,uuid,jsonb)'::regprocedure) into definition;
 anchor:='if applied>payment.amount then';if position(anchor in definition)=0 then raise exception 'Revisar límite de pago antes de integrar apertura.';end if;
 definition:=replace(definition,anchor,'if applied+supplier_opening_source_used(''payment:''||payment.id)>payment.amount then');
 definition:=replace(definition,'''available'',payment.amount-applied','''available'',payment.amount-applied-supplier_opening_source_used(''payment:''||payment.id)');execute definition;
 select pg_get_functiondef('apply_supplier_credit(uuid,uuid,jsonb)'::regprocedure) into definition;
 anchor:='if total>round(credit.total_amount,2) then';if position(anchor in definition)=0 then raise exception 'Revisar límite de NC antes de integrar apertura.';end if;
 definition:=replace(definition,anchor,'if total+supplier_opening_source_used(''credit:''||credit.id)>round(credit.total_amount,2) then');
 definition:=replace(definition,'''available'',round(credit.total_amount,2)-total','''available'',round(credit.total_amount,2)-total-supplier_opening_source_used(''credit:''||credit.id)');execute definition;
end $patch$;
revoke all on supplier_opening_parts,supplier_opening_positions,supplier_opening_sources from public,anon,authenticated;
grant select on supplier_opening_parts,supplier_opening_positions,supplier_opening_sources to service_role;
revoke all on function supplier_opening_source_used(text),supplier_opening_payment_document_used(uuid),supplier_opening_application_signature(text),guard_supplier_opening_usage(),guard_supplier_opening_scope(),save_supplier_opening_applications(uuid,uuid,jsonb),get_supplier_opening_workspace(uuid) from public,anon,authenticated;
grant execute on function supplier_opening_source_used(text),supplier_opening_payment_document_used(uuid),supplier_opening_application_signature(text),guard_supplier_opening_usage(),guard_supplier_opening_scope(),save_supplier_opening_applications(uuid,uuid,jsonb),get_supplier_opening_workspace(uuid) to service_role;
notify pgrst,'reload schema';
commit;
