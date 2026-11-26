-- Migration v288: Phase 3 performance RPCs
-- Eliminates inverted PostgREST joins (order_items -> orders!inner), OFFSET loops,
-- and truncated 1000-row reads across:
--   1. get_sold_product_ids_since(p_since)          -> lib/costs/server.ts
--   2. get_daily_orders_totals(p_from, p_to)        -> api/admin/meta-ads-sheet/route.ts
--   3. get_seller_order_counts()                    -> api/admin/vendedores/route.ts
--   4. get_orphan_order_items_summary()             -> admin/catalogo/page.tsx
--   5. get_capital_estancado_sales(...)             -> admin/capital-estancado/page.tsx
--   6. get_rentabilidad_order_items(...)            -> admin/rentabilidad/page.tsx

BEGIN;

-- ============================================================================
-- 1. Distinct product IDs sold since a given date (costs/server.ts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sold_product_ids_since(p_since date)
RETURNS TABLE (product_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT DISTINCT i.product_id
  FROM public.orders o
  JOIN public.order_items i ON i.order_id = o.id
  WHERE o.order_date >= p_since
    AND i.product_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_sold_product_ids_since(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sold_product_ids_since(date) TO service_role;

-- ============================================================================
-- 2. Daily ERP revenue & order count for Meta Ads ROAS (meta-ads-sheet/route.ts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_daily_orders_totals(p_from date, p_to date)
RETURNS TABLE (
  order_date date,
  revenue numeric,
  orders_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    o.order_date::date AS order_date,
    coalesce(sum(o.total_amount), 0)::numeric AS revenue,
    count(*)::integer AS orders_count
  FROM public.orders o
  WHERE o.order_date >= p_from
    AND o.order_date <= p_to
    AND o.status <> 'Cancelado'
  GROUP BY o.order_date::date
  ORDER BY o.order_date::date ASC;
$$;

REVOKE ALL ON FUNCTION public.get_daily_orders_totals(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_orders_totals(date, date) TO service_role;

-- ============================================================================
-- 3. Order counts per seller (api/admin/vendedores/route.ts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_seller_order_counts()
RETURNS TABLE (
  seller_id uuid,
  orders_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    o.seller_id,
    count(*)::integer AS orders_count
  FROM public.orders o
  WHERE o.seller_id IS NOT NULL
  GROUP BY o.seller_id;
$$;

REVOKE ALL ON FUNCTION public.get_seller_order_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_order_counts() TO service_role;

-- ============================================================================
-- 4. Orphan order_items grouped summary (admin/catalogo/page.tsx)
--    Uses idx_order_items_orphan_product_name partial index.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_orphan_order_items_summary()
RETURNS TABLE (
  product_name text,
  times_ordered integer,
  total_quantity numeric,
  total_sales numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    coalesce(nullif(i.product_name, ''), 'Sin nombre') AS product_name,
    count(*)::integer AS times_ordered,
    coalesce(sum(coalesce(i.quantity, 0)), 0)::numeric AS total_quantity,
    coalesce(sum(coalesce(i.quantity, 0) * coalesce(i.unit_price, 0)), 0)::numeric AS total_sales
  FROM public.order_items i
  WHERE i.product_id IS NULL
  GROUP BY coalesce(nullif(i.product_name, ''), 'Sin nombre')
  ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_orphan_order_items_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orphan_order_items_summary() TO authenticated, service_role;

-- ============================================================================
-- 5. Capital Estancado cursor-paged sales (reads orders by date FIRST)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_capital_estancado_sales(
  p_from date,
  p_after_date date DEFAULT NULL,
  p_after_order uuid DEFAULT NULL,
  p_after_item uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  product_id uuid,
  product_name text,
  quantity numeric,
  unit_price numeric,
  subtotal numeric,
  order_date date,
  order_status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    i.id,
    o.id AS order_id,
    i.product_id,
    i.product_name,
    i.quantity,
    i.unit_price,
    i.subtotal,
    o.order_date::date AS order_date,
    o.status AS order_status
  FROM public.orders o
  JOIN public.order_items i ON i.order_id = o.id
  WHERE o.order_date >= greatest(p_from, p_after_date)
    AND o.status <> 'Cancelado'
    AND (
      p_after_date IS NULL
      OR (o.order_date::date, o.id, i.id) > (p_after_date, p_after_order, p_after_item)
    )
  ORDER BY o.order_date::date, o.id, i.id
  LIMIT 1000;
$$;

REVOKE ALL ON FUNCTION public.get_capital_estancado_sales(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_capital_estancado_sales(date, date, uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 6. Rentabilidad cursor-paged order items (reads orders by date FIRST)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_rentabilidad_order_items(
  p_from date,
  p_to date,
  p_seller_id uuid DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_after_date date DEFAULT NULL,
  p_after_order uuid DEFAULT NULL,
  p_after_item uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  product_id uuid,
  product_name text,
  quantity numeric,
  unit_price numeric,
  historical_unit_cost numeric,
  product_sku text,
  product_catalog_name text,
  product_price numeric,
  legacy_code text,
  customer_name text,
  order_date date,
  order_status text,
  seller_id uuid,
  channel text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    i.id,
    o.id AS order_id,
    i.product_id,
    i.product_name,
    i.quantity,
    i.unit_price,
    i.historical_unit_cost,
    p.sku AS product_sku,
    p.name AS product_catalog_name,
    p.price AS product_price,
    o.legacy_code,
    o.customer_name,
    o.order_date::date AS order_date,
    o.status AS order_status,
    o.seller_id,
    o.channel
  FROM public.orders o
  JOIN public.order_items i ON i.order_id = o.id
  LEFT JOIN public.products p ON p.id = i.product_id
  WHERE o.employee_withdrawal = false
    AND o.status <> 'Cancelado'
    AND o.order_date >= greatest(p_from, p_after_date)
    AND o.order_date <= p_to
    AND (p_seller_id IS NULL OR o.seller_id = p_seller_id)
    AND (p_channel IS NULL OR o.channel = p_channel)
    AND (
      p_after_date IS NULL
      OR (o.order_date::date, o.id, i.id) > (p_after_date, p_after_order, p_after_item)
    )
  ORDER BY o.order_date::date, o.id, i.id
  LIMIT 1000;
$$;

REVOKE ALL ON FUNCTION public.get_rentabilidad_order_items(date, date, uuid, text, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rentabilidad_order_items(date, date, uuid, text, date, uuid, uuid) TO authenticated, service_role;

COMMIT;
