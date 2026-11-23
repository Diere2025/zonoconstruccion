BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_analysis(p_client uuid, p_history boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
DECLARE
  as_of date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Acceso restringido a administradores' USING ERRCODE = '42501';
  END IF;
  IF p_client IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client) THEN
    RAISE EXCEPTION 'No se encontró la ficha del cliente' USING ERRCODE = '22023';
  END IF;

  WITH purchases AS MATERIALIZED (
    SELECT DISTINCT ON (o.channel, o.seller_id, o.order_date, coalesce(nullif(trim(o.legacy_code), ''), o.id::text))
      o.id, o.order_date AS day, nullif(trim(o.legacy_code), '') AS code, o.seller_id, o.channel,
      coalesce(o.total_amount, 0) AS amount
    FROM public.orders o
    WHERE o.client_id = p_client AND o.status = 'Entregado'
      AND o.employee_withdrawal IS NOT TRUE
      AND o.order_date BETWEEN DATE '2000-01-01' AND as_of
      AND (coalesce(p_history, false) OR o.totals->'importacion_historica' IS NULL)
    ORDER BY o.channel, o.seller_id, o.order_date, coalesce(nullif(trim(o.legacy_code), ''), o.id::text),
      (o.totals->'importacion_historica' IS NOT NULL), o.id
  ), lines AS MATERIALIZED (
    SELECT i.product_id, coalesce(nullif(trim(p.name), ''), nullif(trim(i.product_name), ''), 'Producto sin identificar') AS name,
      coalesce(nullif(trim(p.category), ''), 'Sin categoría') AS category,
      i.quantity AS units, coalesce(i.quantity * i.unit_price, 0) AS amount
    FROM purchases o JOIN public.order_items i ON i.order_id = o.id AND i.quantity > 0
    LEFT JOIN public.products p ON p.id = i.product_id
  ), products AS (
    SELECT name, category, sum(units) AS units, sum(amount) AS amount
    FROM lines GROUP BY product_id, name, category
    ORDER BY sum(amount) DESC, sum(units) DESC, name LIMIT 12
  ), categories AS (
    SELECT category, sum(units) AS units, sum(amount) AS amount
    FROM lines GROUP BY category
  )
  SELECT jsonb_build_object(
    'as_of', as_of,
    'orders', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'day', o.day, 'code', o.code, 'channel', o.channel,
      'seller', s.full_name, 'amount', o.amount
    ) ORDER BY o.day DESC, o.id)
      FROM purchases o LEFT JOIN public.sellers s ON s.id = o.seller_id), '[]'::jsonb),
    'products', coalesce((SELECT jsonb_agg(p ORDER BY p.amount DESC, p.units DESC, p.name) FROM products p), '[]'::jsonb),
    'categories', coalesce((SELECT jsonb_agg(c ORDER BY c.amount DESC, c.units DESC, c.category) FROM categories c), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_analysis(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_analysis(uuid,boolean) TO authenticated;

COMMIT;
