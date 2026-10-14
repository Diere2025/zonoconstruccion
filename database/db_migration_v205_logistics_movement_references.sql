-- Consolidate existing, explicit LOG references. Never insert or change cash movements.
-- Liquidada remains a derived state: completed plan + active posted freight payment.
begin;
with references_found as (
 select tx.id transaction_id,
        array(select distinct m[1] from regexp_matches(upper(coalesce(tx.notes,'')), '\m(LOG_REC_[0-9]+[A-Z]?)\M', 'g') m) codes
 from public.cash_transactions tx
 where tx.type='egreso' and tx.currency='ARS' and tx.amount>0
   and tx.reversal_of_transaction_id is null
   and not exists(select 1 from public.cash_transactions reversal where reversal.reversal_of_transaction_id=tx.id)
   and (lower(trim(tx.category))='servicio de flete' or lower(trim(tx.sub_category))='servicio de flete')
), unique_references as (
 select r.transaction_id,d.id dispatch_id
 from references_found r join public.logistics_dispatches d on d.code=r.codes[1]
 where cardinality(r.codes)=1
)
insert into public.logistics_dispatch_movements(transaction_id,dispatch_id,method)
select transaction_id,dispatch_id,'movement_log_reference' from unique_references
on conflict(transaction_id) do nothing;
commit;
