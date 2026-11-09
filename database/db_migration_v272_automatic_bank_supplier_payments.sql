begin;

-- Use the selected financial concept, never the bank description or a partial name.
create or replace function public.bank_classification_supplier(p_concept uuid) returns uuid
language sql stable set search_path=public,pg_temp as $$
 select min(s.id::text)::uuid
 from financial_concepts c
 join financial_concept_operation_types k
   on k.financial_concept_id=c.id and k.operation_type='supplier_payment'
 join suppliers s on s.is_active and bank_reference_key(s.name)=bank_reference_key(c.concept)
 where c.id=p_concept and c.is_active and c.movement_type='Egreso'
   and bank_reference_key(c.concept)<>''
 having count(distinct s.id)=1
$$;

create or replace function public.link_classified_bank_supplier_payment(p_transaction uuid,p_actor uuid)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare
 movement cash_transactions;
 operation financial_operations;
 supplier uuid;
 linked_supplier uuid;
 payment uuid;
begin
 select c.* into movement
 from cash_transactions c
 join bank_entry_ledger_links l on l.cash_transaction_id=c.id and l.kind='created'
 join bank_statement_entries e on e.id=l.entry_id
 where c.id=p_transaction and c.is_imported and c.type='egreso'
   and c.bank_import_key='bank-statement:'||e.id
   and e.signed_amount<0 and c.amount=-e.signed_amount
   and e.financial_account_id=c.financial_account_id
   and c.reversal_of_transaction_id is null
 for update of c;
 if not found then return null; end if;

 select * into operation from financial_operations
 where id=movement.operation_id and origin='bank-statement' and status='posted'
 for update;
 if not found then return null; end if;

 select supplier_id into linked_supplier from supplier_payments
 where cash_transaction_id=movement.id and reversed_at is null limit 1;
 if linked_supplier is not null then
   if operation.detail->>'supplier_link_source'='bank_classification'
      and bank_classification_supplier(movement.financial_concept_id) is distinct from linked_supplier then
     raise exception 'El egreso ya está vinculado a un proveedor. Corregí el pago desde Movimientos.';
   end if;
   return null;
 end if;

 if operation.operation_type not in ('general','operating_expense')
    or operation.person_id is not null or movement.employee_id is not null
    or movement.treasury_settlement_id is not null or movement.register_id is not null
    or movement.payment_method_id is null or movement.currency is null
    or not bank_statement_active_transaction(movement.id)
    or exists(select 1 from cash_transactions c where c.operation_id=operation.id and c.id<>movement.id)
    or exists(select 1 from supplier_payments p where p.cash_transaction_id=movement.id)
    or exists(select 1 from client_payments p where p.cash_transaction_id=movement.id and p.reversed_at is null)
    or exists(select 1 from financial_partner_allocations a where a.cash_transaction_id=movement.id and a.reversed_at is null)
    or exists(select 1 from logistics_dispatch_movements d where d.transaction_id=movement.id)
    or exists(select 1 from payment_planning_realizations p where p.cash_transaction_id=movement.id)
    or exists(select 1 from payment_planning_source_rows p where p.cash_transaction_id=movement.id)
    or exists(select 1 from bank_entry_ledger_links l join bank_statement_order_links o on o.entry_id=l.entry_id
              where l.cash_transaction_id=movement.id) then
   return null;
 end if;

 supplier:=bank_classification_supplier(movement.financial_concept_id);
 if supplier is null or exists(
   select 1 from supplier_account_starts s where s.supplier_id=supplier
   and s.start_date>(movement.created_at at time zone 'America/Argentina/Buenos_Aires')::date
 ) then return null; end if;

 -- The cash row is the serialization point. No cash or document rows are written.
 insert into supplier_payments(supplier_id,amount,currency,payment_method_id,cash_transaction_id,
   financial_account_id,notes,created_by,created_at)
 values(supplier,movement.amount,movement.currency,movement.payment_method_id,movement.id,
   movement.financial_account_id,'Vinculado por la clasificación del extracto bancario.',p_actor,movement.created_at)
 returning id into payment;
 update financial_operations
 set operation_type='supplier_payment',version=version+1,updated_at=clock_timestamp(),
     detail=coalesce(detail,'{}'::jsonb)||jsonb_build_object('supplier_kind','registered',
       'supplier_allocation_mode','documents','supplier_link_source','bank_classification')
 where id=operation.id;
 insert into financial_operation_events(operation_id,action,after_value,reason,actor_id)
 values(operation.id,'bank.supplier_link',jsonb_build_object('transaction_id',movement.id,
   'supplier_id',supplier,'payment_id',payment),'Vinculación automática por concepto de proveedor',p_actor);
 return payment;
end;
$$;

create or replace function public.auto_link_bank_supplier_payment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare transaction_id uuid;
begin
 if tg_table_name='bank_entry_ledger_links' then
   transaction_id:=new.cash_transaction_id;
 else
   select id into transaction_id from cash_transactions
   where operation_id=new.operation_id and operation_line='main' and is_imported;
 end if;
 if transaction_id is not null then
   if tg_table_name='bank_entry_ledger_links' then
     perform link_classified_bank_supplier_payment(transaction_id,new.created_by);
   else
     perform link_classified_bank_supplier_payment(transaction_id,new.actor_id);
   end if;
 end if;
 return null;
end;
$$;

drop trigger if exists bank_supplier_payment_on_import on public.bank_entry_ledger_links;
create trigger bank_supplier_payment_on_import after insert on public.bank_entry_ledger_links
for each row when (new.kind='created') execute function public.auto_link_bank_supplier_payment();
drop trigger if exists bank_supplier_payment_on_classification on public.financial_operation_events;
create trigger bank_supplier_payment_on_classification after insert on public.financial_operation_events
for each row when (new.action in ('bank.classify','movement.classify'))
execute function public.auto_link_bank_supplier_payment();

revoke all on function public.bank_classification_supplier(uuid),
 public.link_classified_bank_supplier_payment(uuid,uuid),
 public.auto_link_bank_supplier_payment() from public,anon,authenticated,service_role;
commit;
