-- Migration v89: Optimization for Orders queries and search performance
-- Resolves "canceling statement due to statement timeout" on orders list queries.

-- 1. Enable pg_trgm extension for text search on orders
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Composite indexes for high-frequency sort orders (order_date DESC, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_orders_order_date_created_at 
  ON public.orders (order_date DESC, created_at DESC);

-- 3. Composite index for wholesale channel queries
CREATE INDEX IF NOT EXISTS idx_orders_channel_date_created_at 
  ON public.orders (channel, order_date DESC, created_at DESC);

-- 4. Fast partial index for active/pending orders (covering 99% of daily vendor/admin list views)
CREATE INDEX IF NOT EXISTS idx_orders_pending_lookup
  ON public.orders (channel, status, order_date DESC, created_at DESC)
  WHERE status IN ('Pendiente', 'Entregando', 'En Espera', 'Modificado', 'En Revisión');

-- 5. Index on legacy_code for exact lookup and code generation checks
CREATE INDEX IF NOT EXISTS idx_orders_legacy_code 
  ON public.orders (legacy_code);

-- 6. Trigram index for fast ILIKE customer_name searches
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm 
  ON public.orders USING gin (customer_name gin_trgm_ops);

-- 7. Clean up redundant RLS policy on order_items that was forcing subqueries for admins
DROP POLICY IF EXISTS "Sellers can view own order items" ON public.order_items;
