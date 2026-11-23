BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_recontact (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pendiente', 'contactado', 'sin_respuesta', 'cerrado')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  updated_by uuid NOT NULL DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_recontact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_recontact_admin ON public.customer_recontact;
CREATE POLICY customer_recontact_admin ON public.customer_recontact TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
REVOKE ALL ON public.customer_recontact FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_recontact TO authenticated;

CREATE OR REPLACE FUNCTION public.save_customer_recontact(p_client uuid, p_seller uuid, p_status text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  saved public.customer_recontact;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Acceso restringido a administradores' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.customer_recontact (client_id, seller_id, status, note, updated_by)
  VALUES (p_client, p_seller, p_status, trim(coalesce(p_note, '')), auth.uid())
  ON CONFLICT (client_id) DO UPDATE SET
    seller_id = excluded.seller_id, status = excluded.status, note = excluded.note,
    updated_by = excluded.updated_by, updated_at = now()
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.top_customer_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$
  WITH digits AS (
    SELECT regexp_replace(split_part(regexp_replace(p_phone, '[;/]', ',', 'g'), ',', 1), '[^0-9]', '', 'g') AS value
  )
  SELECT CASE
    WHEN length(value) = 10 AND NOT value ~ '^([0-9])\1{9}$' THEN value
    WHEN value ~ '^(0054|54)9?[1-9][0-9]{9}$' OR value ~ '^[09][1-9][0-9]{9}$' THEN right(value, 10)
    WHEN value ~ '^0?1115[0-9]{8}$' THEN '11' || right(value, 8)
  END FROM digits;
$$;

CREATE OR REPLACE FUNCTION public.top_customer_report(
  p_from date, p_to date, p_history boolean, p_channel text, p_seller uuid, p_category text,
  p_min_days integer, p_sort text, p_client uuid DEFAULT NULL, p_followup text DEFAULT NULL,
  p_responsible uuid DEFAULT NULL, p_sellers boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET work_mem = '20MB'
SET enable_nestloop = 'off'
SET statement_timeout = '28s'
AS $$
DECLARE
  as_of date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Acceso restringido a administradores' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR p_from < DATE '2000-01-01'
     OR p_to > as_of OR p_min_days IS NULL OR p_min_days NOT BETWEEN 0 AND 730
     OR coalesce(p_sort, '') NOT IN ('amount','orders','units')
     OR coalesce(p_channel, '') NOT IN ('all','retail','wholesale')
     OR (p_followup IS NOT NULL AND p_followup NOT IN ('sin_gestion','pendiente','contactado','sin_respuesta','cerrado')) THEN
    RAISE EXCEPTION 'Revisá el período y los filtros' USING ERRCODE = '22023';
  END IF;

  WITH purchases AS MATERIALIZED (
    SELECT DISTINCT ON (o.client_id, o.channel, o.seller_id, o.order_date, coalesce(nullif(trim(o.legacy_code), ''), o.id::text))
      o.id, o.client_id, o.seller_id, o.order_date, o.locality,
      coalesce(o.total_amount, 0) AS amount
    FROM public.orders o
    WHERE o.order_date BETWEEN p_from AND p_to AND o.status = 'Entregado'
      AND o.client_id IS NOT NULL AND o.employee_withdrawal IS NOT TRUE
      AND (coalesce(p_history, false) OR o.totals->'importacion_historica' IS NULL)
      AND (p_client IS NULL OR p_client = o.client_id)
      AND (p_seller IS NULL OR p_seller = o.seller_id)
      AND (p_channel = 'all'
        OR (p_channel = 'wholesale' AND o.channel = 'mayorista')
        OR (p_channel = 'retail' AND o.channel IN ('minorista','web_organica','mostrador_minorista','vendedor_externo')))
    ORDER BY o.client_id, o.channel, o.seller_id, o.order_date,
      coalesce(nullif(trim(o.legacy_code), ''), o.id::text),
      (o.totals->'importacion_historica' IS NOT NULL), o.id
  ), lines AS MATERIALIZED (
    SELECT i.order_id, i.product_id, coalesce(nullif(trim(pr.name), ''), nullif(trim(i.product_name), ''), 'Producto sin identificar') AS product,
      coalesce(nullif(trim(pr.category), ''), 'Sin categoría') AS category,
      coalesce(i.quantity, 0) AS units, coalesce(i.quantity * i.unit_price, 0) AS amount
    FROM purchases o JOIN public.order_items i ON i.order_id = o.id
    LEFT JOIN public.products pr ON pr.id = i.product_id AND (p_category IS NOT NULL OR p_client IS NOT NULL)
    WHERE coalesce(i.quantity, 0) > 0
      AND (p_category IS NOT NULL OR p_client IS NOT NULL OR p_sort = 'units')
      AND (p_category IS NULL OR p_category = coalesce(nullif(trim(pr.category), ''), 'Sin categoría'))
  ), item_totals AS (
    SELECT order_id, sum(units) AS units, sum(amount) AS amount
    FROM lines GROUP BY order_id
  ), scoped AS MATERIALIZED (
    SELECT o.*, coalesce(i.units, 0) AS units,
      CASE WHEN p_category IS NULL THEN o.amount ELSE i.amount END AS sales
    FROM purchases o LEFT JOIN item_totals i ON i.order_id = o.id
    WHERE p_category IS NULL OR i.order_id IS NOT NULL
  ), activity AS (
    SELECT client_id, count(*) AS orders, count(DISTINCT order_date) AS days,
      sum(sales) AS sales, sum(units) AS units, min(order_date) AS first_in_range
    FROM scoped GROUP BY client_id
  ), latest AS (
    SELECT DISTINCT ON (o.client_id) o.client_id, o.seller_id, o.locality
    FROM scoped o ORDER BY o.client_id, o.order_date DESC, o.id
  ), global_purchases AS MATERIALIZED (
    SELECT o.client_id, max(o.order_date) AS last_purchase
    FROM public.orders o
    WHERE o.status = 'Entregado' AND o.employee_withdrawal IS NOT TRUE
      AND o.client_id IS NOT NULL AND o.order_date BETWEEN DATE '2000-01-01' AND as_of
      AND (coalesce(p_history, false) OR o.totals->'importacion_historica' IS NULL)
    GROUP BY o.client_id
  ), recent_phones AS MATERIALIZED (
    SELECT g.client_id, g.last_purchase, phones.phone,
      regexp_split_to_array(translate(lower(coalesce(c.business_name, '')), 'áéíóúü', 'aeiouu'), '[^[:alnum:]]+') AS name_parts
    FROM global_purchases g JOIN public.clients c ON c.id = g.client_id
    CROSS JOIN LATERAL unnest(ARRAY[public.top_customer_phone(c.phone_primary), public.top_customer_phone(c.phone_secondary)]) phones(phone)
    WHERE p_min_days > 0 AND g.last_purchase > as_of - p_min_days AND phones.phone IS NOT NULL
  ), older_phones AS MATERIALIZED (
    SELECT a.client_id, phones.phone,
      regexp_split_to_array(translate(lower(coalesce(c.business_name, '')), 'áéíóúü', 'aeiouu'), '[^[:alnum:]]+') AS name_parts
    FROM activity a JOIN public.clients c ON c.id = a.client_id JOIN global_purchases g ON g.client_id = a.client_id
    CROSS JOIN LATERAL unnest(ARRAY[public.top_customer_phone(c.phone_primary), public.top_customer_phone(c.phone_secondary)]) phones(phone)
    WHERE p_min_days > 0 AND g.last_purchase <= as_of - p_min_days AND phones.phone IS NOT NULL
  ), connected AS (
    SELECT a.client_id, max(r.last_purchase) AS last_purchase
    FROM older_phones a JOIN recent_phones r USING (phone)
    WHERE (SELECT count(DISTINCT w) FROM unnest(r.name_parts) AS w
           WHERE char_length(w) >= 3 AND w = ANY(a.name_parts)) >= 2
    GROUP BY a.client_id
  ), qualified AS MATERIALIZED (
    SELECT a.*, c.business_name AS name, latest.locality, latest.seller_id, s.full_name AS seller,
      greatest(g.last_purchase, connected.last_purchase) AS last_purchase,
      as_of - greatest(g.last_purchase, connected.last_purchase) AS inactive_days,
      f.status AS followup, f.seller_id AS followup_seller_id
    FROM activity a JOIN public.clients c ON c.id = a.client_id
    JOIN latest ON latest.client_id = a.client_id
    JOIN global_purchases g ON g.client_id = a.client_id
    LEFT JOIN connected ON connected.client_id = a.client_id
    LEFT JOIN public.sellers s ON s.id = latest.seller_id
    LEFT JOIN public.customer_recontact f ON f.client_id = a.client_id
    WHERE (p_min_days = 0 OR as_of - greatest(g.last_purchase, connected.last_purchase) >= p_min_days)
      AND (p_followup IS NULL OR coalesce(f.status, 'sin_gestion') = p_followup)
      AND (p_responsible IS NULL OR f.seller_id = p_responsible)
  ), ranking AS (
    SELECT q.*, row_number() OVER (
      ORDER BY CASE p_sort WHEN 'orders' THEN q.orders WHEN 'units' THEN q.units ELSE q.sales END DESC,
        q.sales DESC, q.last_purchase DESC, q.client_id
    ) AS rank
    FROM qualified q WHERE NOT p_sellers
    ORDER BY rank LIMIT 100
  ), ranking_units AS (
    SELECT o.client_id, sum(i.quantity) AS units
    FROM scoped o JOIN ranking r ON r.client_id = o.client_id
    JOIN public.order_items i ON i.order_id = o.id AND i.quantity > 0
    WHERE p_category IS NULL AND p_client IS NULL AND p_sort <> 'units'
    GROUP BY o.client_id
  ), seller_clients AS (
    SELECT o.seller_id, o.client_id, count(*) AS orders, sum(o.sales) AS sales
    FROM scoped o JOIN qualified q ON q.client_id = o.client_id
    WHERE p_sellers AND o.seller_id IS NOT NULL
    GROUP BY o.seller_id, o.client_id
  ), seller_totals AS (
    SELECT st.seller_id, s.full_name AS seller, count(*) AS clients, sum(st.orders) AS orders,
      sum(st.sales) AS sales, count(*) FILTER (WHERE st.orders >= 2) AS repeat_clients
    FROM seller_clients st JOIN public.sellers s ON s.id = st.seller_id
    GROUP BY st.seller_id, s.full_name
  ), profile_products AS (
    SELECT l.product, l.category, sum(l.units) AS units, sum(l.amount) AS sales, count(DISTINCT l.order_id) AS orders
    FROM lines l
    WHERE p_client IS NOT NULL
    GROUP BY l.product_id, l.product, l.category ORDER BY sum(l.amount) DESC, l.product LIMIT 100
  ), profile AS (
    SELECT c.id, c.business_name AS name, c.phone_primary, c.phone_secondary, c.email,
      f.status, f.note, f.seller_id AS followup_seller_id, f.updated_at,
      coalesce((SELECT jsonb_agg(p ORDER BY sales DESC, product) FROM profile_products p), '[]'::jsonb) AS products
    FROM public.clients c LEFT JOIN public.customer_recontact f ON f.client_id = c.id
    WHERE c.id = p_client
  )
  SELECT jsonb_build_object(
    'ranking', coalesce((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('units', coalesce(u.units, r.units)) ORDER BY rank)
       FROM ranking r LEFT JOIN ranking_units u ON u.client_id = r.client_id), '[]'::jsonb),
    'total', (SELECT count(*) FROM qualified),
    'sellers', coalesce((SELECT jsonb_agg(s ORDER BY sales DESC, seller) FROM seller_totals s), '[]'::jsonb),
    'seller_options', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name) ORDER BY s.full_name) FROM public.sellers s), '[]'::jsonb),
    'categories', (SELECT jsonb_agg(category ORDER BY category) FROM (
      SELECT DISTINCT nullif(trim(pr.category), '') AS category FROM public.products pr WHERE nullif(trim(pr.category), '') IS NOT NULL
      UNION SELECT 'Sin categoría'
    ) categories),
    'profile', (SELECT to_jsonb(profile) FROM profile)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.top_customer_report(date,date,boolean,text,uuid,text,integer,text,uuid,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.top_customer_report(date,date,boolean,text,uuid,text,integer,text,uuid,text,uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.save_customer_recontact(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_customer_recontact(uuid,uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.top_customer_phone(text) FROM PUBLIC, anon, authenticated;

COMMIT;
