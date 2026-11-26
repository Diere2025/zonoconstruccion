-- Migration v286: Phase 1 performance optimization after historical 2025-and-earlier import
-- Adds targeted btree, partial, and trigram indexes without locking production writes,
-- and wraps auth.uid()/auth.role()/is_admin() in (select ...) across core RLS policies
-- so PostgreSQL evaluates them once per query (InitPlan) instead of once per row.
--
-- IMPORTANT: CREATE INDEX CONCURRENTLY statements must run outside a transaction block.
-- Run each statement individually (e.g. via scripts/apply-v286-performance-indexes.cjs).

-- ============================================================================
-- 1. ORDERS: Partial indexes excluding historical imports (99k+ of 114k rows)
--    and supporting EERR / pending payment validations.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active_date_created_at
  ON public.orders (order_date DESC, created_at DESC)
  WHERE ((totals -> 'importacion_historica') IS NULL);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active_seller_date_created_at
  ON public.orders (seller_id, order_date DESC, created_at DESC)
  WHERE ((totals -> 'importacion_historica') IS NULL);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_initial_delivery_date
  ON public.orders (initial_delivery_date DESC)
  WHERE (initial_delivery_date IS NOT NULL);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_payment_unapproved_active
  ON public.orders (order_date DESC)
  WHERE (
    payment_approved = false
    AND status <> 'Cancelado'
    AND (totals -> 'importacion_historica') IS NULL
  );

-- ============================================================================
-- 2. CLIENTS: Trigram indexes for ILIKE search on 93k+ clients & wholesale list
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_business_name_trgm
  ON public.clients USING gin (business_name public.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_phone_primary_trgm
  ON public.clients USING gin (phone_primary public.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_phone_secondary_trgm
  ON public.clients USING gin (phone_secondary public.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_tax_id_trgm
  ON public.clients USING gin (tax_id public.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_wholesale_business_name
  ON public.clients (business_name)
  WHERE (is_wholesale IS TRUE);

-- ============================================================================
-- 3. DELIVERIES: Date-range stats & partial index for active routing (~350 rows)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_status_real_delivery_date
  ON public.deliveries (status, real_delivery_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_active_schedule
  ON public.deliveries (delivery_date, run_number, delivery_order)
  WHERE (status NOT IN ('entregado', 'fallido'));

-- ============================================================================
-- 4. ORDER_ITEMS: Partial index for orphan items lookup (product_id IS NULL)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_orphan_product_name
  ON public.order_items (product_name)
  WHERE (product_id IS NULL);

-- ============================================================================
-- 5. CLIENT_PAYMENTS: Client lookup for balances & account extracts
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_payments_client_id_approved
  ON public.client_payments (client_id)
  WHERE (status = 'Aprobado' AND reversed_at IS NULL);

-- ============================================================================
-- 6. RLS POLICIES: Evaluate auth.uid(), auth.role(), and is_admin() once per
--    query plan (InitPlan) instead of per row across core high-volume tables.
-- ============================================================================

-- CLIENTS
ALTER POLICY "Admins can manage clients" ON public.clients
  USING ((SELECT public.is_admin()));

ALTER POLICY "Authenticated can read permitted clients" ON public.clients
  USING (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR (is_wholesale IS NOT TRUE)
    OR (owner_seller_id = (SELECT auth.uid()))
  );

ALTER POLICY "Sellers can insert clients" ON public.clients
  WITH CHECK (((SELECT auth.role()) = 'authenticated'::text));

-- ADDRESSES
ALTER POLICY "Admins can manage addresses" ON public.addresses
  USING ((SELECT public.is_admin()));

ALTER POLICY "Everyone authenticated can read addresses" ON public.addresses
  USING (((SELECT auth.role()) = 'authenticated'::text));

ALTER POLICY "Sellers can insert addresses" ON public.addresses
  WITH CHECK (((SELECT auth.role()) = 'authenticated'::text));

ALTER POLICY "Anabel can read permitted addresses" ON public.addresses
  USING (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = addresses.client_id
        AND (c.is_wholesale IS NOT TRUE OR c.owner_seller_id = (SELECT auth.uid()))
    )
  );

ALTER POLICY "Anabel can add permitted addresses" ON public.addresses
  WITH CHECK (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = addresses.client_id
        AND (c.is_wholesale IS NOT TRUE OR c.owner_seller_id = (SELECT auth.uid()))
    )
  );

-- ORDERS
ALTER POLICY "Sellers and admins can view orders" ON public.orders
  USING ((seller_id = (SELECT auth.uid())) OR (SELECT public.is_admin()));

ALTER POLICY "Admins can insert all orders" ON public.orders
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "Admins can update all orders" ON public.orders
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins can delete all orders" ON public.orders
  USING ((SELECT public.is_admin()));

ALTER POLICY "Sellers can update their own orders" ON public.orders
  USING ((seller_id = (SELECT auth.uid())) OR (SELECT public.is_admin()));

ALTER POLICY "Anabel orders use permitted clients" ON public.orders
  WITH CHECK (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR (client_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = orders.client_id
        AND (c.is_wholesale IS NOT TRUE OR c.owner_seller_id = (SELECT auth.uid()))
    )
  );

ALTER POLICY "Anabel updates use permitted clients" ON public.orders
  USING (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR (seller_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR (
      (seller_id = (SELECT auth.uid()))
      AND (
        (client_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = orders.client_id
            AND (c.is_wholesale IS NOT TRUE OR c.owner_seller_id = (SELECT auth.uid()))
        )
      )
    )
  );

-- ORDER_ITEMS
ALTER POLICY "Sellers and admins can view order items" ON public.order_items
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.seller_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Admins can insert all order items" ON public.order_items
  WITH CHECK ((SELECT public.is_admin()));

ALTER POLICY "Admins can update all order items" ON public.order_items
  USING ((SELECT public.is_admin()));

ALTER POLICY "Admins can delete all order items" ON public.order_items
  USING ((SELECT public.is_admin()));

ALTER POLICY "Sellers can update their own order items" ON public.order_items
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.seller_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Sellers can delete their own order items" ON public.order_items
  USING (
    (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.seller_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Anabel inserts own order items" ON public.order_items
  WITH CHECK (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.seller_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Anabel updates own order items" ON public.order_items
  USING (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.seller_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.seller_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Anabel deletes own order items" ON public.order_items
  USING (
    ((SELECT auth.uid()) <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.seller_id = (SELECT auth.uid())
    )
  );

-- DELIVERIES
ALTER POLICY "Authenticated users can manage deliveries" ON public.deliveries
  USING (((SELECT auth.role()) = 'authenticated'::text));

ALTER POLICY "Authenticated users can select deliveries" ON public.deliveries
  USING (((SELECT auth.role()) = 'authenticated'::text));

-- CLIENT_PAYMENTS
ALTER POLICY "Admins can manage client payments" ON public.client_payments
  USING ((SELECT public.is_admin()));

ALTER POLICY "Authenticated users can select client payments" ON public.client_payments
  USING (((SELECT auth.role()) = 'authenticated'::text));

ALTER POLICY "Authenticated users can insert client payments" ON public.client_payments
  WITH CHECK (((SELECT auth.role()) = 'authenticated'::text));

-- ============================================================================
-- 7. REFRESH PLANNER STATISTICS
-- ============================================================================
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.clients;
ANALYZE public.addresses;
ANALYZE public.deliveries;
ANALYZE public.client_payments;
