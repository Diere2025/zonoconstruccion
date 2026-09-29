-- Apply outside a transaction. pg_trgm is already installed in public.
-- The btree on legacy_code cannot serve ILIKE '%code%' searches.
-- Concurrent creation keeps orders available for reads and writes.
SET lock_timeout = '3s';
SET statement_timeout = '120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_legacy_code_trgm
  ON public.orders USING gin (legacy_code public.gin_trgm_ops);
RESET statement_timeout;
RESET lock_timeout;
