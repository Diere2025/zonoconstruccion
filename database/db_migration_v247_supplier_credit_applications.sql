begin;
alter table public.supplier_purchases add column credit_applied_amount numeric(15,2) not null default 0;
create table public.supplier_credit_allocations (
 id uuid primary key default gen_random_uuid(), credit_id uuid not null references supplier_purchases(id),
 purchase_id uuid not null references supplier_purchases(id), amount numeric(15,2) not null check(amount>0 and amount<1000000000000),
 check(credit_id<>purchase_id), unique(credit_id,purchase_id)
);
create index supplier_credit_target on public.supplier_credit_allocations(purchase_id);
create table public.supplier_credit_events (
 id uuid primary key default gen_random_uuid(),credit_id uuid not null references supplier_purchases(id),actor_id uuid not null references auth.users(id),
 request_id uuid not null,payload jsonb not null,before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table public.supplier_credit_allocations enable row level security;
alter table public.supplier_credit_events enable row level security;
revoke all on public.supplier_credit_allocations,public.supplier_credit_events from public,anon,authenticated;
grant all on public.supplier_credit_allocations to service_role;
grant select,insert on public.supplier_credit_events to service_role;

create function public.supplier_purchase_credit_applied(p_purchase uuid,p_except uuid default null) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(amount),0) from supplier_credit_allocations where purchase_id=p_purchase and credit_id is distinct from p_except
$$;
create function public.supplier_credit_signature(p_credit uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(p)::text||coalesce((select jsonb_agg(to_jsonb(a) order by a.purchase_id,a.id)::text from supplier_credit_allocations a where a.credit_id=p.id),'[]')) from supplier_purchases p where p.id=p_credit
$$;
create function public.guard_supplier_credit_document() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare outgoing numeric; incoming numeric;
begin
 select coalesce(sum(amount),0) into outgoing from supplier_credit_allocations where credit_id=old.id;
 incoming:=supplier_purchase_credit_applied(old.id);
 if tg_op='DELETE' then
  if outgoing>0 or incoming>0 then raise exception 'Liberá las aplicaciones de crédito antes de eliminar el documento.'; end if;
  return old;
 end if;
 if outgoing>0 and (new.status='Anulado' or new.document_type is distinct from 'Nota de Crédito' or new.total_amount<outgoing
   or new.currency is distinct from old.currency or new.supplier_id is distinct from old.supplier_id) then raise exception 'Liberá las aplicaciones antes de modificar o anular la nota de crédito.'; end if;
 if incoming>0 and (new.status='Anulado' or new.document_type='Nota de Crédito' or new.currency is distinct from old.currency or new.supplier_id is distinct from old.supplier_id
   or round(new.total_amount,2)<supplier_purchase_cash_applied(old.id)+incoming) then raise exception 'La modificación excede el pendiente. Regularizá las aplicaciones de pagos y créditos.'; end if;
 new.credit_applied_amount:=incoming;
 if new.status<>'Anulado' and new.document_type is distinct from 'Nota de Crédito' then
  new.status:=case when coalesce(new.paid_amount,0)+incoming>=round(new.total_amount,2) then 'Pagado'
    when coalesce(new.paid_amount,0)+incoming>0 then 'Parcial' else 'Pendiente' end;
 end if;
 return new;
end $$;
create trigger supplier_credit_document_guard before update or delete on supplier_purchases for each row execute function guard_supplier_credit_document();

create function public.refresh_supplier_credit_target() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
 target:=case when tg_op='DELETE' then old.purchase_id else new.purchase_id end;
 update supplier_purchases set paid_amount=supplier_purchase_cash_applied(target),credit_applied_amount=supplier_purchase_credit_applied(target) where id=target;
 if tg_op='UPDATE' and old.purchase_id<>new.purchase_id then
  update supplier_purchases set paid_amount=supplier_purchase_cash_applied(old.purchase_id),credit_applied_amount=supplier_purchase_credit_applied(old.purchase_id) where id=old.purchase_id;
 end if;
 return null;
end $$;
create trigger supplier_credit_target_refresh after insert or update or delete on supplier_credit_allocations for each row execute function refresh_supplier_credit_target();

create function public.guard_supplier_credit_scope() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from supplier_credit_allocations a join supplier_purchases c on c.id=a.credit_id
  where c.supplier_id=coalesce(new.supplier_id,old.supplier_id) and (not supplier_document_in_account(a.credit_id) or not supplier_document_in_account(a.purchase_id))) then
  raise exception 'Liberá las aplicaciones de crédito antes de excluir sus documentos o cambiar el punto de partida.';
 end if;
 return null;
end $$;
create trigger supplier_credit_start_scope after insert or update or delete on supplier_account_starts for each row execute function guard_supplier_credit_scope();
create trigger supplier_credit_history_scope after insert or update or delete on supplier_account_history for each row execute function guard_supplier_credit_scope();
create trigger supplier_credit_document_scope after update on supplier_purchases for each row execute function guard_supplier_credit_scope();

drop function public.get_supplier_application_documents(uuid);
create function public.get_supplier_application_documents(p_supplier uuid)
returns table(id uuid,invoice_number text,total_amount numeric,paid_amount numeric,credit_applied_amount numeric,currency text,status text,document_type text,purchase_date timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.invoice_number::text,p.total_amount,supplier_purchase_cash_applied(p.id),supplier_purchase_credit_applied(p.id),p.currency::text,p.status::text,p.document_type::text,p.purchase_date::timestamptz
 from supplier_purchases p where p.supplier_id=p_supplier order by p.id
$$;
create function public.get_supplier_application_credits(p_supplier uuid)
returns table(id uuid,invoice_number text,amount numeric,currency text,purchase_date timestamptz,signature text,allocations jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.invoice_number::text,p.total_amount,p.currency::text,p.purchase_date::timestamptz,supplier_credit_signature(p.id),
 coalesce((select jsonb_agg(jsonb_build_object('purchase_id',a.purchase_id,'amount',a.amount) order by a.purchase_id) from supplier_credit_allocations a where a.credit_id=p.id),'[]'::jsonb)
 from supplier_purchases p where supplier_id=p_supplier and document_type='Nota de Crédito' and status<>'Anulado' and total_amount>0 order by p.purchase_date,p.id
$$;
create function public.apply_supplier_credit(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare credit public.supplier_purchases; doc public.supplier_purchases; prior public.supplier_credit_events;
 before_value jsonb; result jsonb; item jsonb; amount numeric; total numeric:=0; touched uuid[];
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para aplicar créditos.' using errcode='42501'; end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000
  or jsonb_typeof(p_payload->'allocations') is distinct from 'array' or jsonb_array_length(p_payload->'allocations')>100 then raise exception 'Aplicación inválida.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-credit:'||p_request::text,0));
 select * into prior from supplier_credit_events where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505'; end if;
  return prior.after_value;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict credit from supplier_purchases where id=(p_payload->>'creditId')::uuid for update;
 if credit.document_type is distinct from 'Nota de Crédito' or credit.status='Anulado' or credit.total_amount<=0 then raise exception 'Nota de crédito inválida.'; end if;
 if supplier_credit_signature(credit.id) is distinct from p_payload->>'signature' then raise exception 'El crédito cambió. Actualizá la vista.' using errcode='40001'; end if;
 if not supplier_document_in_account(credit.id) and jsonb_array_length(p_payload->'allocations')>0 then raise exception 'La nota de crédito está fuera del saldo vigente.'; end if;
 if (select count(*)<>count(distinct x->>'purchase_id') from jsonb_array_elements(p_payload->'allocations') x) then raise exception 'No repitas documentos.'; end if;
 before_value:=jsonb_build_object('credit',to_jsonb(credit),'allocations',(select allocations from get_supplier_application_credits(credit.supplier_id) where id=credit.id));
 select coalesce(array_agg(distinct id),'{}') into touched from (
  select purchase_id id from supplier_credit_allocations where credit_id=credit.id
  union select (x->>'purchase_id')::uuid from jsonb_array_elements(p_payload->'allocations') x
 ) targets;
 perform 1 from supplier_purchases where id=any(touched) order by id for update;
 for item in select x from jsonb_array_elements(p_payload->'allocations') x loop
  amount:=(item->>'amount')::numeric;
  if amount is null or amount<=0 or amount<>round(amount,2) or amount>=1000000000000 then raise exception 'Importe de aplicación inválido.'; end if;
  select * into strict doc from supplier_purchases where id=(item->>'purchase_id')::uuid;
  if doc.id=credit.id or doc.supplier_id<>credit.supplier_id or doc.currency<>credit.currency or doc.status='Anulado' or doc.document_type='Nota de Crédito'
   or not supplier_document_in_account(doc.id) or amount>round(doc.total_amount,2)-supplier_purchase_cash_applied(doc.id)-supplier_purchase_credit_applied(doc.id,credit.id) then raise exception 'Documento, moneda o pendiente inválidos.'; end if;
  total:=total+amount;
 end loop;
 if total>round(credit.total_amount,2) then raise exception 'El total aplicado supera la nota de crédito.'; end if;
 delete from supplier_credit_allocations where credit_id=credit.id;
 insert into supplier_credit_allocations(credit_id,purchase_id,amount)
 select credit.id,(x->>'purchase_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_payload->'allocations') x;
 result:=jsonb_build_object('creditId',credit.id,'applied',total,'available',round(credit.total_amount,2)-total,'signature',supplier_credit_signature(credit.id),'allocations',p_payload->'allocations');
 insert into supplier_credit_events(credit_id,actor_id,request_id,payload,before_value,after_value) values(credit.id,p_actor,p_request,p_payload,before_value,result);
 return result;
end $$;

-- All payment paths must subtract credit settlements while keeping paid_amount monetary.
do $patch$
declare definition text; updated text; anchor text;
begin
 select pg_get_functiondef('public.reapply_supplier_payment(uuid,uuid,jsonb)'::regprocedure) into definition;
 anchor:='round(doc.total_amount,2)-supplier_purchase_cash_applied(doc.id,payment.id)';
 if position(anchor in definition)=0 then raise exception 'Revisar la integración de créditos con la redistribución de pagos.'; end if;
 execute replace(definition,anchor,anchor||'-supplier_purchase_credit_applied(doc.id)');
 select pg_get_functiondef('public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text)'::regprocedure) into definition;
 updated:=regexp_replace(definition,
  'select greatest\(0,round\(doc.total_amount,2\)-coalesce\(sum\(a.amount\),0\)\) into due\s+from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id\s+where a.purchase_id=doc.id and p.reversed_at is null;',
  'select greatest(0,round(doc.total_amount,2)-public.supplier_purchase_cash_applied(doc.id)-public.supplier_purchase_credit_applied(doc.id)) into due;');
 if updated=definition then raise exception 'Revisar la integración de créditos con FIFO.'; end if;
 definition:=updated;
 updated:=regexp_replace(definition,
  'select coalesce\(sum\(a.amount\),0\) into v_paid from public.supplier_payment_allocations a\s+join public.supplier_payments p on p.id=a.payment_id where a.purchase_id=v_alloc_id and p.reversed_at is null;',
  'select public.supplier_purchase_cash_applied(v_alloc_id) into v_paid;');
 if updated=definition then raise exception 'Revisar la integración de créditos con aplicaciones manuales.'; end if;
 anchor:='round(v_purchase.total_amount,2)-v_paid';
 if position(anchor in updated)=0 then raise exception 'Revisar el límite monetario de aplicación.'; end if;
 execute replace(updated,anchor,anchor||'-public.supplier_purchase_credit_applied(v_purchase.id)');
end $patch$;
revoke all on function public.supplier_purchase_credit_applied(uuid,uuid),public.supplier_credit_signature(uuid),public.get_supplier_application_credits(uuid),public.get_supplier_application_documents(uuid),public.apply_supplier_credit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.supplier_purchase_credit_applied(uuid,uuid),public.supplier_credit_signature(uuid),public.get_supplier_application_credits(uuid),public.get_supplier_application_documents(uuid),public.apply_supplier_credit(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
