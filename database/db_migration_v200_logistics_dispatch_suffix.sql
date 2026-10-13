-- Prepared locally. Allows a single uppercase letter suffix without changing existing codes.
begin;
alter table public.logistics_dispatches drop constraint if exists logistics_dispatches_code_check;
alter table public.logistics_dispatches add constraint logistics_dispatches_code_check check (code ~ '^LOG_REC_[0-9]+[A-Z]?$');
commit;
