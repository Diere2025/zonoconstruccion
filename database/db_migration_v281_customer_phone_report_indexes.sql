-- Run each statement outside an explicit transaction to keep client writes available.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_report_primary_phone
  ON public.clients (public.top_customer_phone(phone_primary)) WHERE phone_primary IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_report_secondary_phone
  ON public.clients (public.top_customer_phone(phone_secondary)) WHERE phone_secondary IS NOT NULL;
