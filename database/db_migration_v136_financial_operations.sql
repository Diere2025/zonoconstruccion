begin;

create or replace function public.can_manage_financial_operations(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from auth.users u left join public.sellers s
    on s.id=u.id or (not exists(select 1 from public.sellers direct where direct.id=u.id)
      and lower(s.email)=lower(u.email))
    where u.id=p_user_id and coalesce(s.is_active,true)
      and (s.role='admin' or 'admin'=any(coalesce(s.roles,'{}'))
        or lower(u.email) in ('diego.boveda@gmail.com','caroibarra.93@gmail.com')));
$$;
revoke all on function public.can_manage_financial_operations(uuid) from public,anon,authenticated;
grant execute on function public.can_manage_financial_operations(uuid) to service_role;

create table if not exists public.financial_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check(operation_type in ('general','supplier_payment','customer_collection','payroll_payment','operating_expense','tax_payment','internal_transfer')),
  effective_date date not null,
  status text not null default 'posted' check(status in ('posted','cancelled')),
  version integer not null default 1 check(version>0),
  detail jsonb not null default '{}' check(jsonb_typeof(detail)='object'),
  origin text not null default 'movements',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.cash_transactions add column if not exists operation_id uuid references public.financial_operations(id) on delete restrict;
alter table public.cash_transactions add column if not exists operation_line text;
alter table public.cash_transactions add column if not exists reversal_of_transaction_id uuid references public.cash_transactions(id) on delete restrict;
create unique index if not exists cash_operation_line_uidx on public.cash_transactions(operation_id,operation_line) where operation_id is not null;
create unique index if not exists cash_reversal_uidx on public.cash_transactions(reversal_of_transaction_id) where reversal_of_transaction_id is not null;
create index if not exists cash_operation_idx on public.cash_transactions(operation_id);
alter table public.supplier_payments add column if not exists reversed_at timestamptz;
alter table public.client_payments add column if not exists reversed_at timestamptz;

create table if not exists public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments(id) on delete cascade,
  purchase_id uuid not null references public.supplier_purchases(id) on delete restrict,
  amount numeric(15,2) not null check(amount>0),
  unique(payment_id,purchase_id)
);
-- Metadata-only adoption: preserves each legacy payment ID and all cash balances.
insert into public.supplier_payment_allocations(payment_id,purchase_id,amount)
  select id,purchase_id,amount from public.supplier_payments where purchase_id is not null and reversed_at is null
  on conflict do nothing;
create index if not exists supplier_allocations_purchase_idx on public.supplier_payment_allocations(purchase_id);

create table if not exists public.financial_operation_requests (
  actor_id uuid not null references auth.users(id), request_key uuid not null,
  action text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_key)
);
create table if not exists public.financial_operation_events (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.financial_operations(id), action text not null,
  before_value jsonb,after_value jsonb,reason text not null default '',
  actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.operation_vouchers (
  operation_id uuid not null references public.financial_operations(id),
  voucher_id uuid not null references public.treasury_vouchers(id),primary key(operation_id,voucher_id)
);
create table if not exists public.financial_concept_operation_types (
  financial_concept_id uuid not null references public.financial_concepts(id) on delete cascade,
  operation_type text not null check(operation_type in ('general','supplier_payment','customer_collection','payroll_payment','operating_expense','tax_payment','internal_transfer')),
  primary key(financial_concept_id,operation_type)
);
-- Conservative initial mapping; original classifications remain snapshots.
insert into public.financial_concept_operation_types
select id,case when category in ('Proveedores','Proveedores (Deuda)','Insumo de Producto') then 'supplier_payment'
 when category='Sueldos' then 'payroll_payment' when category='Recaudación' and sub_category<>'Cambio Entregas' then 'customer_collection'
 when category in ('Impuestos','IIGG') then 'tax_payment' when category='Movimiento de cuentas' then 'internal_transfer'
 when movement_type='Egreso' then 'operating_expense' else 'general' end
from public.financial_concepts on conflict do nothing;

alter table public.financial_operations enable row level security;
alter table public.financial_operation_requests enable row level security;
alter table public.financial_operation_events enable row level security;
alter table public.supplier_payment_allocations enable row level security;
alter table public.operation_vouchers enable row level security;
alter table public.financial_concept_operation_types enable row level security;
revoke all on public.financial_operations,public.financial_operation_requests,public.financial_operation_events,
 public.supplier_payment_allocations,public.operation_vouchers,public.financial_concept_operation_types from anon,authenticated;
grant all on public.financial_operations,public.financial_operation_requests,public.financial_operation_events,
 public.supplier_payment_allocations,public.operation_vouchers,public.financial_concept_operation_types to service_role;
grant usage,select on sequence public.financial_operation_events_id_seq to service_role;

create or replace function public.guard_financial_operation_rows()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if current_user not in ('authenticated','anon') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='cash_transactions' then
    if (tg_op<>'INSERT' and old.operation_id is not null) or (tg_op<>'DELETE' and new.operation_id is not null) then
      raise exception 'Corregí el movimiento desde su operación financiera.' using errcode='42501';
    end if;
  else
    v_id:=case when tg_op='DELETE' then old.cash_transaction_id else new.cash_transaction_id end;
    if exists(select 1 from public.cash_transactions where id=v_id and operation_id is not null)
      or (tg_op='UPDATE' and exists(select 1 from public.cash_transactions where id=old.cash_transaction_id and operation_id is not null)) then
      raise exception 'Los pagos se modifican junto con su operación financiera.' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists cash_financial_operation_guard on public.cash_transactions;
create trigger cash_financial_operation_guard before insert or update or delete on public.cash_transactions
 for each row execute function public.guard_financial_operation_rows();
drop trigger if exists supplier_financial_operation_guard on public.supplier_payments;
create trigger supplier_financial_operation_guard before insert or update or delete on public.supplier_payments
 for each row execute function public.guard_financial_operation_rows();
drop trigger if exists client_financial_operation_guard on public.client_payments;
create trigger client_financial_operation_guard before insert or update or delete on public.client_payments
 for each row execute function public.guard_financial_operation_rows();

-- Preserve the installed trigger's implementation for unmanaged orders. Managed
-- receipts must not be deleted/recreated by a later nonfinancial order edit.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.sync_order_payment_to_ledger()'::regprocedure) into v_def;
  if position('financial_operation_order_guard' in v_def)=0 then
    v_def:=regexp_replace(v_def,'BEGIN',E'BEGIN\n  -- financial_operation_order_guard\n  IF current_setting(''zono.financial_write'',true)=''on'' THEN RETURN NEW; END IF;\n  IF EXISTS (SELECT 1 FROM public.client_payments cp JOIN public.cash_transactions t ON t.id=cp.cash_transaction_id WHERE cp.order_id=NEW.id AND t.operation_id IS NOT NULL) THEN\n    IF TG_OP=''UPDATE'' AND (NEW.totals->''payments_breakdown'' IS DISTINCT FROM OLD.totals->''payments_breakdown'' OR NEW.payment_status IS DISTINCT FROM OLD.payment_status) THEN\n      RAISE EXCEPTION ''Corregí los cobros vinculados desde Movimientos antes de cambiar el pago del pedido.'';\n    END IF;\n    RETURN NEW;\n  END IF;', 'i');
    execute v_def;
  end if;
end;
$$;

create or replace view public.supplier_account_entries as
select p.supplier_id,'purchase'::text as source,p.id as source_id,
 (coalesce(p.purchase_date,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date as entry_date,
 p.currency,p.invoice_number as reference,coalesce(p.document_type,'Factura') as kind,
 round(case when p.document_type='Nota de Crédito' then -p.total_amount else p.total_amount end,2) as amount,
 p.status='Anulado' as voided,p.notes,p.purchase_order_id,p.purchase_reception_id,null::uuid as cash_transaction_id
from public.supplier_purchases p
union all
select p.supplier_id,'payment',p.id,(coalesce(t.created_at,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date,
 p.currency,coalesce(t.concept,p.notes,'Pago a proveedor'),'Pago',-round(p.amount,2),
 p.reversed_at is not null,p.notes,null::uuid,null::uuid,p.cash_transaction_id
from public.supplier_payments p left join public.cash_transactions t on t.id=p.cash_transaction_id;
revoke all on public.supplier_account_entries from anon,authenticated;
grant select on public.supplier_account_entries to service_role;

create or replace function public.financial_operation_snapshot(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.cash_transactions; o public.financial_operations; v_alloc jsonb; v_supplier uuid; v_order uuid; v_cp uuid; v_vouchers jsonb; v_group text; v_destination uuid; v_type text;
begin
 select * into strict t from public.cash_transactions where id=p_transaction_id;
 select * into o from public.financial_operations where id=t.operation_id;
 if o.operation_type='internal_transfer' and t.reversal_of_transaction_id is null then
   select * into strict t from public.cash_transactions where operation_id=o.id and type='egreso' and reversal_of_transaction_id is null;
   select financial_account_id into v_destination from public.cash_transactions where operation_id=o.id and type='ingreso' and reversal_of_transaction_id is null;
 elsif t.operation_id is null and t.notes like '%TRF-GROUP:%' then
   v_group:=substring(t.notes from 'TRF-GROUP: ([0-9a-fA-F-]{36})');
   if v_group is null then raise exception 'Transferencia histórica sin grupo válido.'; end if;
   select * into strict t from public.cash_transactions where substring(notes from 'TRF-GROUP: ([0-9a-fA-F-]{36})')=v_group and type='egreso';
   select financial_account_id into strict v_destination from public.cash_transactions where substring(notes from 'TRF-GROUP: ([0-9a-fA-F-]{36})')=v_group and type='ingreso';
 end if;
 select supplier_id into v_supplier from public.supplier_payments where cash_transaction_id=t.id and reversed_at is null order by id limit 1;
 select cp.order_id,cp.id into v_order,v_cp from public.client_payments cp where cp.cash_transaction_id=t.id and cp.reversed_at is null order by cp.id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('purchase_id',a.purchase_id,'amount',a.amount::text)),'[]') into v_alloc
 from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id where p.cash_transaction_id=t.id and p.reversed_at is null;
 select coalesce(jsonb_agg(voucher_id),'[]') into v_vouchers from public.operation_vouchers where operation_id=t.operation_id;
 v_type:=coalesce(o.operation_type,case when v_destination is not null then 'internal_transfer' when v_supplier is not null or t.category='Proveedores' then 'supplier_payment' when v_order is not null or (t.category='Recaudación' and t.type='ingreso') then 'customer_collection' when t.employee_id is not null or t.category='Sueldos' then 'payroll_payment' when t.category in ('Impuestos','IIGG') then 'tax_payment' when t.type='egreso' then 'operating_expense' else 'general' end);
 return jsonb_build_object('transaction',to_jsonb(t),'operation',case when o.id is null then null else to_jsonb(o) end,
   'planning',exists(select 1 from public.payment_planning_realizations r where r.cash_transaction_id=t.id or r.cash_transaction_id in (select id from public.cash_transactions where operation_id=t.operation_id))
      or exists(select 1 from public.payment_planning_source_rows r where r.cash_transaction_id=t.id),
   'payload',jsonb_build_object('operation_type',v_type,
    'effective_date',(t.created_at at time zone 'America/Argentina/Buenos_Aires')::date,'account_id',t.financial_account_id,
    'destination_account_id',v_destination,
    'direction',t.type,'amount',t.amount::text,'payment_method_id',t.payment_method_id,'concept',coalesce(t.concept,''),
    'category',t.category,'sub_category',coalesce(t.sub_category,''),'efe_category',coalesce(t.efe_category,''),
    'financial_concept_id',t.financial_concept_id,'cost_center_id',t.cost_center_id,'route_sheet_id',t.route_sheet_id,'notes',coalesce(t.notes,''),
    'employee_id',t.employee_id,'supplier_id',v_supplier,'order_id',v_order,'client_payment_id',v_cp,
    'allocations',v_alloc,'detail',coalesce(o.detail,'{}'),'voucher_ids',v_vouchers));
end;
$$;
revoke all on function public.financial_operation_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.financial_operation_snapshot(uuid) to service_role;

create or replace function public.recalculate_operation_documents(p_purchases uuid[],p_orders uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_paid numeric; v_total numeric; v_order public.orders;
begin
 for v_id in select distinct unnest(p_purchases) order by 1 loop
   select total_amount into v_total from public.supplier_purchases where id=v_id for update;
   select coalesce(sum(a.amount),0) into v_paid from public.supplier_payment_allocations a
    join public.supplier_payments p on p.id=a.payment_id where a.purchase_id=v_id and p.reversed_at is null;
   update public.supplier_purchases set paid_amount=v_paid,status=case when v_paid=0 then 'Pendiente' when v_paid>=v_total then 'Pagado' else 'Parcial' end where id=v_id and status is distinct from 'Anulado';
 end loop;
 for v_id in select distinct unnest(p_orders) order by 1 loop
   select * into v_order from public.orders where id=v_id for update;
   select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_id and status='Aprobado' and reversed_at is null;
   update public.orders set totals=jsonb_set(coalesce(totals,'{}'),'{pending_balance}',to_jsonb(greatest(0,total_amount-v_paid))),
    payment_status=case when v_paid>=total_amount then 'Abonado' when v_paid>0 then 'Seniado' else 'Pendiente' end,
    payment_approved=(v_paid>0) where id=v_id;
 end loop;
end;
$$;
revoke all on function public.recalculate_operation_documents(uuid[],uuid[]) from public,anon,authenticated;

create or replace function public.mutate_financial_operation(p_actor uuid,p_key uuid,p_action text,p_payload jsonb,p_target jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_req public.financial_operation_requests; v_request jsonb;
 v_op public.financial_operations; v_tx public.cash_transactions; v_old public.cash_transactions;
 v_account public.financial_accounts; v_dest public.financial_accounts; v_concept public.financial_concepts;
 v_order public.orders; v_purchase public.supplier_purchases; v_payment public.client_payments;
 v_type text; v_direction text; v_amount numeric; v_date date; v_timestamp timestamptz;
 v_account_id uuid; v_pm uuid; v_supplier uuid; v_order_id uuid; v_employee uuid;
 v_cp uuid; v_sp uuid; v_ids uuid[]:='{}'; v_purchases uuid[]:='{}'; v_orders uuid[]:='{}';
 v_alloc jsonb; v_sum numeric:=0; v_paid numeric; v_group text; v_before jsonb; v_result jsonb;
 v_alloc_id uuid; v_currency text; v_linked boolean; v_count integer; v_id uuid;
begin
 if not public.can_manage_financial_operations(p_actor) then raise exception 'No tenés permisos para gestionar Movimientos.' using errcode='42501'; end if;
 if p_action not in ('save','link','cancel') or p_key is null then raise exception 'Acción inválida.'; end if;
 v_request:=jsonb_build_object('payload',p_payload,'target',p_target,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
 select * into v_req from public.financial_operation_requests where actor_id=p_actor and request_key=p_key;
 if found then
   if v_req.action<>p_action or v_req.payload<>v_request then raise exception 'Clave reutilizada con otros datos.' using errcode='23505'; end if;
   return v_req.result;
 end if;
 perform set_config('zono.financial_write','on',true);

 if nullif(p_target->>'transaction_id','') is not null then
   -- Serialize all postings before taking any dependent row locks, preventing
   -- competing mutations from acquiring document locks in opposite orders.
   perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
   select * into strict v_tx from public.cash_transactions where id=(p_target->>'transaction_id')::uuid for update;
   if v_tx.treasury_settlement_id is not null then raise exception 'Corregí este movimiento desde Rendiciones.'; end if;
   if v_tx.reversal_of_transaction_id is not null then raise exception 'Una compensación no admite edición.'; end if;
   if v_tx.register_id is not null then raise exception 'Corregí este movimiento desde la caja de vendedores.'; end if;
   if v_tx.operation_id is null then
     if p_target->'expected_transaction' is null or p_target->'expected_transaction'<>to_jsonb(v_tx) then raise exception 'El movimiento cambió. Volvé a abrirlo.' using errcode='40001'; end if;
     v_ids:=array[v_tx.id];
     if v_tx.notes like '%TRF-GROUP:%' then
       v_group:=substring(v_tx.notes from 'TRF-GROUP: ([0-9a-fA-F-]{36})');
       if v_group is null then raise exception 'Transferencia histórica sin grupo verificable.'; end if;
       perform 1 from public.cash_transactions where substring(notes from 'TRF-GROUP: ([0-9a-fA-F-]{36})')=v_group order by id for update;
       select array_agg(id order by type),count(*) into v_ids,v_count from public.cash_transactions
        where substring(notes from 'TRF-GROUP: ([0-9a-fA-F-]{36})')=v_group and operation_id is null;
       if v_count<>2 or (select count(distinct type) from public.cash_transactions where id=any(v_ids))<>2
        or (select count(distinct financial_account_id) from public.cash_transactions where id=any(v_ids))<>2
        or exists(select 1 from public.cash_transactions where id=any(v_ids) and (amount<>v_tx.amount or currency<>v_tx.currency or treasury_settlement_id is not null or register_id is not null)) then
         raise exception 'El grupo histórico no es una transferencia consistente.';
       end if;
     end if;
     if exists(select 1 from public.payment_planning_realizations where cash_transaction_id=any(v_ids)) then raise exception 'Desconciliá primero el movimiento desde Planificación.'; end if;
     insert into public.financial_operations(operation_type,effective_date,created_by,origin)
       values(case when v_group is not null then 'internal_transfer' else coalesce(p_payload->>'operation_type','general') end,
        (v_tx.created_at at time zone 'America/Argentina/Buenos_Aires')::date,p_actor,'legacy') returning * into v_op;
     update public.cash_transactions set operation_id=v_op.id,operation_line=case when v_group is null then 'main' else type end where id=any(v_ids);
   else
     select * into strict v_op from public.financial_operations where id=v_tx.operation_id for update;
     if nullif(p_target->>'operation_id','')::uuid is distinct from v_op.id or (p_target->>'expected_version')::integer is distinct from v_op.version then raise exception 'La operación cambió. Volvé a abrirla.' using errcode='40001'; end if;
     if v_op.status<>'posted' then raise exception 'La operación ya está anulada.'; end if;
     select array_agg(id order by id) into v_ids from public.cash_transactions where operation_id=v_op.id and reversal_of_transaction_id is null;
     perform 1 from public.cash_transactions where id=any(v_ids) order by id for update;
   end if;
   if exists(select 1 from public.payment_planning_realizations where cash_transaction_id=any(v_ids))
     or exists(select 1 from public.payment_planning_source_rows where cash_transaction_id=any(v_ids)) then raise exception 'Corregí primero el vínculo desde Planificación.'; end if;
   v_before:=jsonb_build_object('operation',to_jsonb(v_op),'transactions',(select jsonb_agg(to_jsonb(t)) from public.cash_transactions t where id=any(v_ids)),
     'supplier_payments',(select jsonb_agg(to_jsonb(p)) from public.supplier_payments p where cash_transaction_id=any(v_ids)),
     'allocations',(select jsonb_agg(to_jsonb(a)) from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id where p.cash_transaction_id=any(v_ids)),
     'client_payments',(select jsonb_agg(to_jsonb(p)) from public.client_payments p where cash_transaction_id=any(v_ids)));
 else
   if p_action<>'save' then raise exception 'Elegí un movimiento.'; end if;
   perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 end if;

 select coalesce(array_agg(distinct a.purchase_id),'{}') into v_purchases from public.supplier_payment_allocations a
 join public.supplier_payments p on p.id=a.payment_id where p.cash_transaction_id=any(v_ids) and p.reversed_at is null;
 select coalesce(array_agg(distinct order_id) filter(where order_id is not null),'{}') into v_orders
 from public.client_payments where cash_transaction_id=any(v_ids) and reversed_at is null;
 perform 1 from public.supplier_purchases where id=any(v_purchases) order by id for update;
 perform 1 from public.orders where id=any(v_orders) order by id for update;

 if p_action='cancel' then
   if length(trim(p_reason))<3 then raise exception 'Indicá el motivo de anulación.'; end if;
   update public.supplier_payments set reversed_at=clock_timestamp() where cash_transaction_id=any(v_ids) and reversed_at is null;
   update public.client_payments set reversed_at=clock_timestamp(),status='Rechazado' where cash_transaction_id=any(v_ids) and reversed_at is null;
   for v_old in select * from public.cash_transactions where id=any(v_ids) loop
     insert into public.cash_transactions(type,category,amount,currency,payment_method_id,financial_account_id,
       concept,notes,created_by,created_at,sub_category,efe_category,business_unit,cost_center_id,operation_id,operation_line,reversal_of_transaction_id)
     values(case when v_old.type='ingreso' then 'egreso' else 'ingreso' end,v_old.category,v_old.amount,v_old.currency,
       v_old.payment_method_id,v_old.financial_account_id,'Anulación: '||left(coalesce(v_old.concept,''),220),p_reason,p_actor,v_old.created_at,
       v_old.sub_category,v_old.efe_category,v_old.business_unit,v_old.cost_center_id,v_op.id,'reverse-'||v_old.id,v_old.id);
   end loop;
   update public.financial_operations set status='cancelled',version=version+1,updated_at=clock_timestamp() where id=v_op.id returning * into v_op;
   perform public.recalculate_operation_documents(v_purchases,v_orders);
 else
   if jsonb_typeof(p_payload)<>'object' then raise exception 'Datos inválidos.'; end if;
   v_type:=p_payload->>'operation_type';v_direction:=p_payload->>'direction';v_amount:=(p_payload->>'amount')::numeric;
   v_account_id:=(p_payload->>'account_id')::uuid;v_pm:=(p_payload->>'payment_method_id')::uuid;v_date:=(p_payload->>'effective_date')::date;
   v_supplier:=nullif(p_payload->>'supplier_id','')::uuid;v_order_id:=nullif(p_payload->>'order_id','')::uuid;v_employee:=nullif(p_payload->>'employee_id','')::uuid;
   if v_type is null or v_type not in ('general','supplier_payment','customer_collection','payroll_payment','operating_expense','tax_payment','internal_transfer')
     or v_direction is null or v_direction not in ('ingreso','egreso') or v_date is null
     or v_amount is null or v_amount<=0 or v_amount>=1e12 or v_amount<>round(v_amount,2) or v_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Operación inválida.'; end if;
   if (v_type='customer_collection' and v_direction<>'ingreso') or (v_type in ('supplier_payment','payroll_payment','operating_expense','tax_payment') and v_direction<>'egreso') then raise exception 'Dirección incompatible con la operación.'; end if;
   if length(trim(coalesce(p_payload->>'concept','')))<2 or length(p_payload->>'concept')>240 or length(trim(coalesce(p_payload->>'category','')))=0 then raise exception 'Indicá concepto y categoría.'; end if;
   if jsonb_typeof(p_payload->'detail') is distinct from 'object' then raise exception 'Detalle inválido.'; end if;
   if v_type in ('payroll_payment','tax_payment') and coalesce(p_payload#>>'{detail,period}','') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Indicá el período.'; end if;
   if v_type='payroll_payment' and (coalesce(p_payload#>>'{detail,payroll_kind}','') not in ('salary','advance','temporary','agreement') or (v_employee is null and length(trim(coalesce(p_payload#>>'{detail,beneficiary}','')))=0)) then raise exception 'Identificá al personal y el concepto.'; end if;
   if v_type='tax_payment' and length(trim(coalesce(p_payload#>>'{detail,organism}','')))=0 then raise exception 'Indicá el organismo.'; end if;
   select * into strict v_account from public.financial_accounts where id=v_account_id and is_active for update;
   v_currency:=v_account.currency;
   perform 1 from public.payment_methods where id=v_pm;
   if not found then raise exception 'Medio de pago inexistente.'; end if;
   if v_employee is not null and not exists(select 1 from public.employees where id=v_employee and is_active) then raise exception 'Empleado no disponible.'; end if;
   if v_type<>'payroll_payment' and v_employee is not null then raise exception 'Empleado incompatible con el tipo de operación.'; end if;
   if v_type<>'supplier_payment' and (v_supplier is not null or jsonb_array_length(coalesce(p_payload->'allocations','[]'))>0) then raise exception 'Proveedor incompatible con el tipo de operación.'; end if;
   if v_type<>'customer_collection' and v_order_id is not null then raise exception 'Pedido incompatible con el tipo de operación.'; end if;
   if nullif(p_payload->>'financial_concept_id','') is not null then
     select * into strict v_concept from public.financial_concepts where id=(p_payload->>'financial_concept_id')::uuid and is_active;
     if v_concept.category is distinct from p_payload->>'category' or v_concept.sub_category is distinct from coalesce(p_payload->>'sub_category','')
       or v_concept.efe_category is distinct from coalesce(p_payload->>'efe_category','') then raise exception 'La clasificación no coincide con el concepto.'; end if;
     if v_type<>'general' and not exists(select 1 from public.financial_concept_operation_types where financial_concept_id=v_concept.id and operation_type=v_type) then raise exception 'Concepto incompatible con la operación.'; end if;
   end if;
   if v_type='internal_transfer' then
     if v_account_id=(p_payload->>'destination_account_id')::uuid then raise exception 'Elegí dos cuentas distintas.'; end if;
     select * into strict v_dest from public.financial_accounts where id=(p_payload->>'destination_account_id')::uuid and is_active for update;
     if v_dest.currency<>v_currency then raise exception 'La transferencia debe usar la misma moneda.'; end if;
   end if;
   if v_op.id is not null and (v_type='internal_transfer') is distinct from (v_op.operation_type='internal_transfer') then raise exception 'No se puede convertir una transferencia en un movimiento simple.'; end if;
   if p_action='link' and (v_amount<>v_tx.amount or v_direction<>v_tx.type or v_account_id<>v_tx.financial_account_id or v_date<>(v_tx.created_at at time zone 'America/Argentina/Buenos_Aires')::date) then raise exception 'La vinculación no puede modificar el dinero registrado.'; end if;
   v_timestamp:=make_timestamptz(extract(year from v_date)::int,extract(month from v_date)::int,extract(day from v_date)::int,12,0,0,'America/Argentina/Buenos_Aires');

   -- Remove prior effects only inside this transaction. All validations below
   -- can fail safely: PostgreSQL rolls every prior change back on exception.
   update public.supplier_payments set reversed_at=clock_timestamp() where cash_transaction_id=any(v_ids) and reversed_at is null;
   update public.client_payments set reversed_at=clock_timestamp(),status='Rechazado' where cash_transaction_id=any(v_ids) and reversed_at is null;
   if v_type='supplier_payment' then
     if v_supplier is null then raise exception 'Elegí un proveedor.'; end if;
     perform 1 from public.suppliers where id=v_supplier for update;
     if not found then raise exception 'Proveedor inexistente.'; end if;
     if jsonb_typeof(coalesce(p_payload->'allocations','[]'))<>'array' or jsonb_array_length(coalesce(p_payload->'allocations','[]'))>100 then raise exception 'Imputaciones inválidas.'; end if;
     for v_alloc in select value from jsonb_array_elements(coalesce(p_payload->'allocations','[]')) order by value->>'purchase_id' loop
       v_alloc_id:=(v_alloc->>'purchase_id')::uuid;
       select * into strict v_purchase from public.supplier_purchases where id=v_alloc_id for update;
       select coalesce(sum(a.amount),0) into v_paid from public.supplier_payment_allocations a
        join public.supplier_payments p on p.id=a.payment_id where a.purchase_id=v_alloc_id and p.reversed_at is null;
       if v_purchase.supplier_id<>v_supplier or v_purchase.currency<>v_currency or v_purchase.status='Anulado'
         or v_purchase.document_type='Nota de Crédito' or (v_alloc->>'amount')::numeric<=0
         or (v_alloc->>'amount')::numeric<>round((v_alloc->>'amount')::numeric,2)
         or (v_alloc->>'amount')::numeric>v_purchase.total_amount-v_paid then raise exception 'Documento, moneda o saldo de imputación inválido.'; end if;
       v_sum:=v_sum+(v_alloc->>'amount')::numeric;v_purchases:=array_append(v_purchases,v_alloc_id);
     end loop;
     if v_sum>v_amount then raise exception 'Las imputaciones superan el pago.'; end if;
   end if;
   if v_type='customer_collection' then
     if v_order_id is null then raise exception 'Elegí el pedido.'; end if;
     select * into strict v_order from public.orders where id=v_order_id for update;
     if v_order.status in ('Cancelado','Anulado') or v_order.client_id is null or v_currency<>'ARS' then raise exception 'Pedido o moneda no disponible para cobro.'; end if;
     v_orders:=array_append(v_orders,v_order_id);
     v_cp:=nullif(p_payload->>'client_payment_id','')::uuid;
     if v_cp is not null then
       select * into strict v_payment from public.client_payments where id=v_cp for update;
       if v_payment.order_id is distinct from v_order_id or v_payment.currency is distinct from v_currency or (v_payment.amount<>v_amount and not coalesce(v_payment.cash_transaction_id=any(v_ids),false))
         or (v_payment.cash_transaction_id is not null and not(v_payment.cash_transaction_id=any(v_ids))) then raise exception 'Ese cobro ya está vinculado o no coincide.'; end if;
       if v_payment.reversed_at is not null and not(v_payment.cash_transaction_id=any(v_ids)) then raise exception 'El cobro fue anulado.'; end if;
       if coalesce(v_payment.cash_transaction_id=any(v_ids),false) then
         select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_order_id and status='Aprobado' and reversed_at is null;
         if v_amount>greatest(0,v_order.total_amount-v_paid) then raise exception 'El importe supera el saldo pendiente del pedido.'; end if;
       end if;
     else
       -- Link an existing approved receipt instead of adding the same receipt
       -- again. Ambiguous partial matches require explicit user selection.
       select count(*) into v_count from public.client_payments where order_id=v_order_id and cash_transaction_id is null
        and status='Aprobado' and reversed_at is null and currency=v_currency;
       if v_count>0 then
         select count(*),min(id::text)::uuid into v_count,v_cp from public.client_payments where order_id=v_order_id and cash_transaction_id is null
          and status='Aprobado' and reversed_at is null and currency=v_currency and amount=v_amount;
         if v_count<>1 then raise exception 'Hay cobros previos: seleccioná el comprobante exacto antes de vincularlo.'; end if;
       else
         select coalesce(sum(amount),0) into v_paid from public.client_payments where order_id=v_order_id and status='Aprobado' and reversed_at is null;
         if v_amount>greatest(0,v_order.total_amount-v_paid) then raise exception 'El importe supera el saldo pendiente del pedido.'; end if;
       end if;
     end if;
   end if;

   if v_op.id is null then
     insert into public.financial_operations(operation_type,effective_date,detail,created_by)
      values(v_type,v_date,p_payload->'detail',p_actor) returning * into v_op;
     if v_type='internal_transfer' then
       insert into public.cash_transactions(type,category,amount,currency,payment_method_id,financial_account_id,concept,created_by,created_at,operation_id,operation_line)
       values('egreso','Movimiento de cuentas',v_amount,v_currency,v_pm,v_account.id,trim(p_payload->>'concept'),p_actor,v_timestamp,v_op.id,'egreso'),
        ('ingreso','Movimiento de cuentas',v_amount,v_currency,v_pm,v_dest.id,trim(p_payload->>'concept'),p_actor,v_timestamp,v_op.id,'ingreso');
     else
       insert into public.cash_transactions(type,category,amount,currency,payment_method_id,financial_account_id,concept,created_by,created_at,operation_id,operation_line)
        values(v_direction,p_payload->>'category',v_amount,v_currency,v_pm,v_account.id,trim(p_payload->>'concept'),p_actor,v_timestamp,v_op.id,'main');
     end if;
   else
     update public.financial_operations set operation_type=v_type,effective_date=v_date,detail=p_payload->'detail',version=version+1,updated_at=clock_timestamp() where id=v_op.id returning * into v_op;
   end if;
   update public.cash_transactions set type=case when v_type='internal_transfer' then type else v_direction end,
     financial_account_id=case when v_type='internal_transfer' and type='ingreso' then v_dest.id else v_account.id end,
     amount=v_amount,currency=v_currency,payment_method_id=v_pm,category=case when v_type='internal_transfer' then 'Movimiento de cuentas' else p_payload->>'category' end,
     sub_category=nullif(p_payload->>'sub_category',''),efe_category=nullif(p_payload->>'efe_category',''),financial_concept_id=v_concept.id,
     concept=trim(p_payload->>'concept'),notes=nullif(p_payload->>'notes',''),created_at=v_timestamp,
     cost_center_id=nullif(p_payload->>'cost_center_id','')::uuid,route_sheet_id=nullif(p_payload->>'route_sheet_id','')::uuid,
     employee_id=v_employee,business_unit=coalesce((select code from public.cost_centers where id=nullif(p_payload->>'cost_center_id','')::uuid),'ZONO')
     where operation_id=v_op.id and reversal_of_transaction_id is null;
   select id into v_id from public.cash_transactions where operation_id=v_op.id and reversal_of_transaction_id is null order by operation_line limit 1;
   if v_type='supplier_payment' then
     insert into public.supplier_payments(supplier_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,notes,created_by,created_at)
      values(v_supplier,v_amount,v_currency,v_pm,v_id,v_account.id,p_payload->>'concept',p_actor,v_timestamp) returning id into v_sp;
     insert into public.supplier_payment_allocations(payment_id,purchase_id,amount)
      select v_sp,(a->>'purchase_id')::uuid,(a->>'amount')::numeric from jsonb_array_elements(coalesce(p_payload->'allocations','[]')) a;
   elsif v_type='customer_collection' then
     if v_cp is not null then
       update public.client_payments set amount=v_amount,cash_transaction_id=v_id,financial_account_id=v_account.id,payment_method_id=v_pm,status='Aprobado',reversed_at=null where id=v_cp;
     else
       insert into public.client_payments(client_id,order_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,status,notes,created_by,created_at)
        values(v_order.client_id,v_order_id,v_amount,v_currency,v_pm,v_id,v_account.id,'Aprobado',p_payload->>'concept',p_actor,v_timestamp);
     end if;
   end if;
   delete from public.operation_vouchers where operation_id=v_op.id;
   insert into public.operation_vouchers(operation_id,voucher_id)
     select distinct v_op.id,v::uuid from jsonb_array_elements_text(coalesce(p_payload->'voucher_ids','[]')) v;
   perform public.recalculate_operation_documents(v_purchases,v_orders);
 end if;
 v_result:=jsonb_build_object('operation_id',v_op.id,'version',v_op.version,'status',v_op.status,'transaction_ids',
   (select jsonb_agg(id order by operation_line) from public.cash_transactions where operation_id=v_op.id and reversal_of_transaction_id is null));
 insert into public.financial_operation_events(operation_id,action,before_value,after_value,reason,actor_id)
  values(v_op.id,p_action,v_before,jsonb_build_object('result',v_result,'payload',p_payload),coalesce(p_reason,''),p_actor);
 insert into public.financial_operation_requests(actor_id,request_key,action,payload,result) values(p_actor,p_key,p_action,v_request,v_result);
 perform set_config('zono.financial_write','off',true);
 return v_result;
end;
$$;
revoke all on function public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.mutate_financial_operation(uuid,uuid,text,jsonb,jsonb,text) to service_role;
create or replace function public.guard_planning_financial_operation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.cash_transaction_id is not null and exists(
   select 1 from public.cash_transactions t left join public.financial_operations o on o.id=t.operation_id
   where t.id=new.cash_transaction_id and (t.reversal_of_transaction_id is not null or o.status='cancelled' or o.operation_type='internal_transfer')
 ) then raise exception 'Una transferencia o movimiento anulado no puede conciliar una obligación.'; end if;
 return new;
end;
$$;
revoke all on function public.guard_planning_financial_operation() from public,anon,authenticated;
drop trigger if exists planning_financial_operation_guard on public.payment_planning_realizations;
create trigger planning_financial_operation_guard before insert or update of cash_transaction_id on public.payment_planning_realizations
for each row execute function public.guard_planning_financial_operation();
notify pgrst,'reload schema';
commit;
