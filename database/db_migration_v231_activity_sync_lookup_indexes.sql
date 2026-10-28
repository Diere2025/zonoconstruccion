begin;
-- Reconciliation and payment-reference loops probe these keys repeatedly.
create index if not exists mp_bank_web_amount_time_idx on public.mp_bank_web_rows(mp_account_id,amount,occurred_at);
create index if not exists mp_bank_web_operation_amount_idx on public.mp_bank_web_rows(mp_account_id,operation_id,amount,occurred_at);
create index if not exists mp_bank_web_entry_idx on public.mp_bank_web_rows((coalesce(statement_entry_id,prepared_entry_id)));
create index if not exists mp_bank_web_payment_idx on public.mp_bank_web_rows(payment_id) where payment_id is not null;
create index if not exists mp_bank_activity_canonical_idx on public.mp_bank_activity_rows(mp_account_id,occurred_at,amount,public.bank_reference_key(name));
create index if not exists orders_bank_legacy_code_idx on public.orders(lower(trim(legacy_code)));
commit;
