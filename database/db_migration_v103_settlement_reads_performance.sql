-- Rendition detail searches movement references in notes using ILIKE '%code%'.
-- Run outside a transaction so concurrent builds keep production writes available.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_transactions_notes_trgm
  ON public.cash_transactions USING gin (notes gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_payments_order_id ON public.client_payments (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mp_payments_order_id ON public.mp_payments (order_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mp_payments_order_code ON public.mp_payments (order_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_route_sheet_order
  ON public.deliveries (route_sheet_id, delivery_order);
