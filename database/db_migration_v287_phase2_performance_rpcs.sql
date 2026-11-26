-- Migration v287: Phase 2 performance RPCs
-- Eliminates full-table scans and view aggregations across:
--   1. get_next_legacy_code(p_prefix)           -> pedidos/page.tsx code generation
--   2. get_clients_with_stats(...)              -> vendedores/clientes/page.tsx
--   3. get_commission_order_ids(p_from, p_to)   -> admin/comisiones/page.tsx
--   4. get_client_account_balances_input()      -> api/admin/finanzas-data?action=balances

BEGIN;

-- ============================================================================
-- 1. Next available legacy_code for a seller prefix (replaces 1000-row scan + 50-loop)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_next_legacy_code(p_prefix text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_prefix_len integer := length(v_prefix);
  v_max_num bigint := 1000;
  v_pad_len integer := 0;
  v_next_num bigint;
  v_candidate text;
  v_attempts integer := 0;
  v_rec record;
BEGIN
  IF v_prefix = '' THEN
    RETURN 'ZC' || right(extract(epoch FROM now())::bigint::text, 6);
  END IF;

  SELECT max_num, pad_len
  INTO v_rec
  FROM (
    SELECT
      num_val AS max_num,
      CASE WHEN left(num_str, 1) = '0' AND length(num_str) > 1 THEN length(num_str) ELSE 0 END AS pad_len
    FROM (
      SELECT
        substr(part, v_prefix_len + 1) AS num_str,
        (regexp_match(substr(part, v_prefix_len + 1), '^([0-9]+)'))[1]::bigint AS num_val
      FROM public.orders o
      CROSS JOIN LATERAL unnest(regexp_split_to_array(o.legacy_code, '[\/,]')) AS raw_part
      CROSS JOIN LATERAL (SELECT upper(btrim(raw_part)) AS part) AS p
      WHERE o.legacy_code ILIKE (v_prefix || '%')
        AND left(p.part, v_prefix_len) = v_prefix
        AND substr(p.part, v_prefix_len + 1) ~ '^[0-9]+'
    ) parsed
    WHERE num_val IS NOT NULL
    ORDER BY num_val DESC
    LIMIT 1
  ) top_code;

  IF FOUND AND v_rec.max_num > v_max_num THEN
    v_max_num := v_rec.max_num;
    v_pad_len := coalesce(v_rec.pad_len, 0);
  END IF;

  v_next_num := v_max_num + 1;

  WHILE v_attempts < 50 LOOP
    IF v_pad_len > 0 THEN
      v_candidate := v_prefix || lpad(v_next_num::text, v_pad_len, '0');
    ELSE
      v_candidate := v_prefix || v_next_num::text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE legacy_code = v_candidate) THEN
      RETURN v_candidate;
    END IF;

    v_next_num := v_next_num + 1;
    v_attempts := v_attempts + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_legacy_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_legacy_code(text) TO authenticated, service_role;

-- ============================================================================
-- 2. Paginated/searched clients with stats (filters clients FIRST, aggregates only matched rows)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_clients_with_stats(
  p_search text DEFAULT NULL,
  p_filter_type text DEFAULT 'all',
  p_is_wholesale boolean DEFAULT false,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  internal_code text,
  code text,
  business_name text,
  aliases text[],
  phone_primary text,
  phone_secondary text,
  tax_id text,
  billing_address text,
  credit_limit numeric,
  created_at timestamptz,
  email text,
  is_wholesale boolean,
  total_charged numeric,
  total_paid numeric,
  balance numeric,
  orders_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_pattern text := '%' || coalesce(v_search, '') || '%';
BEGIN
  -- Case 1: Search query OR default alphabetical order -> filter & limit clients FIRST
  IF v_search IS NOT NULL OR coalesce(p_filter_type, 'all') NOT IN ('top_sales', 'recurrent', 'pending_balance') THEN
    RETURN QUERY
    WITH matched_clients AS (
      SELECT c.*
      FROM public.clients c
      WHERE c.business_name IS NOT NULL
        AND c.business_name <> ''
        AND (NOT coalesce(p_is_wholesale, false) OR c.is_wholesale IS TRUE)
        AND (
          v_search IS NULL
          OR c.business_name ILIKE v_pattern
          OR c.phone_primary ILIKE v_pattern
          OR c.phone_secondary ILIKE v_pattern
          OR c.tax_id ILIKE v_pattern
        )
      ORDER BY c.business_name ASC
      LIMIT v_limit
    ),
    ord_stats AS (
      SELECT o.client_id,
             coalesce(sum(o.total_amount), 0)::numeric AS total_charged,
             count(*)::integer AS orders_count
      FROM public.orders o
      WHERE o.client_id IN (SELECT mc.id FROM matched_clients mc)
        AND o.status <> 'Anulado'
        AND o.status <> 'Cancelado'
      GROUP BY o.client_id
    ),
    pay_stats AS (
      SELECT cp.client_id,
             coalesce(sum(cp.amount * coalesce(cp.exchange_rate, 1::numeric)), 0)::numeric AS total_paid
      FROM public.client_payments cp
      WHERE cp.client_id IN (SELECT mc.id FROM matched_clients mc)
        AND cp.status = 'Aprobado'
      GROUP BY cp.client_id
    )
    SELECT
      mc.id, mc.internal_code, mc.code, mc.business_name, mc.aliases,
      mc.phone_primary, mc.phone_secondary, mc.tax_id, mc.billing_address,
      mc.credit_limit, mc.created_at, mc.email, mc.is_wholesale,
      coalesce(os.total_charged, 0)::numeric AS total_charged,
      coalesce(ps.total_paid, 0)::numeric AS total_paid,
      CASE WHEN mc.is_wholesale IS TRUE
        THEN (coalesce(os.total_charged, 0) - coalesce(ps.total_paid, 0))::numeric
        ELSE 0::numeric
      END AS balance,
      coalesce(os.orders_count, 0)::integer AS orders_count
    FROM matched_clients mc
    LEFT JOIN ord_stats os ON os.client_id = mc.id
    LEFT JOIN pay_stats ps ON ps.client_id = mc.id
    ORDER BY mc.business_name ASC;
    RETURN;
  END IF;

  -- Case 2: Pending balance -> only wholesale clients (~871 rows) can have balance > 0
  IF p_filter_type = 'pending_balance' THEN
    RETURN QUERY
    WITH wholesale_clients AS (
      SELECT c.*
      FROM public.clients c
      WHERE c.is_wholesale IS TRUE
        AND c.business_name IS NOT NULL
        AND c.business_name <> ''
    ),
    ord_stats AS (
      SELECT o.client_id,
             coalesce(sum(o.total_amount), 0)::numeric AS total_charged,
             count(*)::integer AS orders_count
      FROM public.orders o
      WHERE o.client_id IN (SELECT wc.id FROM wholesale_clients wc)
        AND o.status <> 'Anulado'
        AND o.status <> 'Cancelado'
      GROUP BY o.client_id
    ),
    pay_stats AS (
      SELECT cp.client_id,
             coalesce(sum(cp.amount * coalesce(cp.exchange_rate, 1::numeric)), 0)::numeric AS total_paid
      FROM public.client_payments cp
      WHERE cp.client_id IN (SELECT wc.id FROM wholesale_clients wc)
        AND cp.status = 'Aprobado'
      GROUP BY cp.client_id
    )
    SELECT
      wc.id, wc.internal_code, wc.code, wc.business_name, wc.aliases,
      wc.phone_primary, wc.phone_secondary, wc.tax_id, wc.billing_address,
      wc.credit_limit, wc.created_at, wc.email, wc.is_wholesale,
      coalesce(os.total_charged, 0)::numeric AS total_charged,
      coalesce(ps.total_paid, 0)::numeric AS total_paid,
      (coalesce(os.total_charged, 0) - coalesce(ps.total_paid, 0))::numeric AS balance,
      coalesce(os.orders_count, 0)::integer AS orders_count
    FROM wholesale_clients wc
    LEFT JOIN ord_stats os ON os.client_id = wc.id
    LEFT JOIN pay_stats ps ON ps.client_id = wc.id
    WHERE (coalesce(os.total_charged, 0) - coalesce(ps.total_paid, 0)) > 0
    ORDER BY (coalesce(os.total_charged, 0) - coalesce(ps.total_paid, 0)) DESC
    LIMIT v_limit;
    RETURN;
  END IF;

  -- Case 3: top_sales or recurrent -> aggregate orders by client_id, take top N, then join payments
  RETURN QUERY
  WITH ranked_orders AS (
    SELECT o.client_id,
           coalesce(sum(o.total_amount), 0)::numeric AS total_charged,
           count(*)::integer AS orders_count
    FROM public.orders o
    JOIN public.clients c ON c.id = o.client_id
    WHERE o.status <> 'Anulado'
      AND o.status <> 'Cancelado'
      AND c.business_name IS NOT NULL
      AND c.business_name <> ''
      AND (NOT coalesce(p_is_wholesale, false) OR c.is_wholesale IS TRUE)
    GROUP BY o.client_id
    ORDER BY
      CASE WHEN p_filter_type = 'top_sales' THEN coalesce(sum(o.total_amount), 0) ELSE count(*)::numeric END DESC
    LIMIT v_limit
  ),
  pay_stats AS (
    SELECT cp.client_id,
           coalesce(sum(cp.amount * coalesce(cp.exchange_rate, 1::numeric)), 0)::numeric AS total_paid
    FROM public.client_payments cp
    WHERE cp.client_id IN (SELECT ro.client_id FROM ranked_orders ro)
      AND cp.status = 'Aprobado'
    GROUP BY cp.client_id
  )
  SELECT
    c.id, c.internal_code, c.code, c.business_name, c.aliases,
    c.phone_primary, c.phone_secondary, c.tax_id, c.billing_address,
    c.credit_limit, c.created_at, c.email, c.is_wholesale,
    ro.total_charged,
    coalesce(ps.total_paid, 0)::numeric AS total_paid,
    CASE WHEN c.is_wholesale IS TRUE
      THEN (ro.total_charged - coalesce(ps.total_paid, 0))::numeric
      ELSE 0::numeric
    END AS balance,
    ro.orders_count
  FROM ranked_orders ro
  JOIN public.clients c ON c.id = ro.client_id
  LEFT JOIN pay_stats ps ON ps.client_id = ro.client_id
  ORDER BY
    CASE WHEN p_filter_type = 'top_sales' THEN ro.total_charged ELSE ro.orders_count::numeric END DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clients_with_stats(text, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clients_with_stats(text, text, boolean, integer) TO authenticated, service_role;

-- ============================================================================
-- 3. Commission delivered order IDs for a date range (avoids downloading 100k+ orders)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_commission_order_ids(
  p_from date,
  p_to date
)
RETURNS TABLE (order_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT o.id AS order_id
  FROM public.orders o
  LEFT JOIN public.deliveries d ON d.order_id = o.id
  LEFT JOIN public.route_sheets rs ON rs.id = d.route_sheet_id
  WHERE o.status = 'Entregado'
    AND o.employee_withdrawal = false
    AND coalesce(
      rs.delivery_date::date,
      d.real_delivery_date::date,
      d.delivery_date::date,
      o.initial_delivery_date::date,
      o.order_date::date
    ) BETWEEN p_from AND p_to;
$$;

REVOKE ALL ON FUNCTION public.get_commission_order_ids(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_commission_order_ids(date, date) TO authenticated, service_role;

-- ============================================================================
-- 4. Client account balances input (only explicit credit-term orders + counts)
--    Replaces downloading 93k clients + 114k orders + 11k payments in finanzas-data
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_client_account_balances_input(
  p_include_reversed_filter boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH account_methods AS (
    SELECT id, name
    FROM public.payment_methods
    WHERE btrim(name) ~* '^(cuenta corriente|cta\.?\s*cte\.?)$'
  ),
  credit_orders AS (
    SELECT
      o.id,
      o.client_id,
      o.payment_method_id,
      o.total_amount,
      o.status,
      o.payment_status,
      o.totals
    FROM public.orders o
    WHERE o.client_id IS NOT NULL
      AND lower(btrim(coalesce(o.status, ''))) NOT IN ('cancelado', 'anulado')
      AND (
        o.payment_method_id IN (SELECT id FROM account_methods)
        OR (
          jsonb_typeof(o.totals -> 'payments_breakdown') = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(o.totals -> 'payments_breakdown') AS elem
            WHERE (elem ->> 'payment_method_id') IN (SELECT id::text FROM account_methods)
          )
        )
      )
  ),
  settled_without_payment AS (
    SELECT count(*)::integer AS cnt
    FROM public.orders o
    WHERE o.client_id IS NOT NULL
      AND lower(btrim(coalesce(o.status, ''))) NOT IN ('cancelado', 'anulado')
      AND (
        lower(btrim(coalesce(o.payment_status, ''))) = 'abonado'
        OR (
          coalesce(o.total_amount, 0) > 0
          AND (o.totals ->> 'pending_balance') ~ '^-?[0-9]+(\.[0-9]+)?$'
          AND round(((o.totals ->> 'pending_balance')::numeric) * 100) = 0
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.client_payments cp
        WHERE cp.order_id = o.id
          AND cp.status = 'Aprobado'
          AND (NOT p_include_reversed_filter OR cp.reversed_at IS NULL)
      )
  ),
  credit_clients AS (
    SELECT c.id, c.business_name
    FROM public.clients c
    WHERE c.id IN (SELECT DISTINCT client_id FROM credit_orders)
  ),
  credit_payments AS (
    SELECT cp.id, cp.client_id, cp.order_id, cp.amount, cp.currency, cp.status, cp.reversed_at
    FROM public.client_payments cp
    WHERE cp.order_id IN (SELECT id FROM credit_orders)
      AND cp.status = 'Aprobado'
      AND (NOT p_include_reversed_filter OR cp.reversed_at IS NULL)
  )
  SELECT jsonb_build_object(
    'methods', coalesce((SELECT jsonb_agg(to_jsonb(am)) FROM account_methods am), '[]'::jsonb),
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(cc)) FROM credit_clients cc), '[]'::jsonb),
    'orders', coalesce((SELECT jsonb_agg(to_jsonb(co)) FROM credit_orders co), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(cp)) FROM credit_payments cp), '[]'::jsonb),
    'settledWithoutLinkedPayment', (SELECT cnt FROM settled_without_payment)
  );
$$;

REVOKE ALL ON FUNCTION public.get_client_account_balances_input(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_account_balances_input(boolean) TO service_role;

COMMIT;
