BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_customer_first_sale(p_clients uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '24s'
SET work_mem = '16MB'
SET jit = 'off'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Acceso restringido a administradores' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_clients), 0) = 0 THEN RETURN '{}'::jsonb; END IF;
  IF cardinality(p_clients) > 120000 THEN
    RAISE EXCEPTION 'El período supera la cantidad de fichas consultables.' USING ERRCODE = '22023';
  END IF;

  WITH client_keys AS MATERIALIZED (
    SELECT c.id, public.top_customer_phone(c.phone_primary) AS primary_phone,
      public.top_customer_phone(c.phone_secondary) AS alternate_phone,
      regexp_split_to_array(translate(lower(coalesce(c.business_name, '')), 'áéíóúü', 'aeiouu'), '[^[:alnum:]]+') AS name_parts
    FROM public.clients c JOIN (SELECT DISTINCT unnest(p_clients) AS id) ids USING (id)
  ), key_phones AS MATERIALIZED (
    SELECT id, name_parts, unnest(ARRAY[primary_phone, alternate_phone]) AS phone
    FROM client_keys
  ), phones AS (
    SELECT DISTINCT phone FROM key_phones WHERE phone IS NOT NULL
  ), other_phones AS (
    SELECT c.id AS client_id, c.business_name, p.phone
    FROM phones p JOIN public.clients c
      ON c.phone_primary IS NOT NULL AND public.top_customer_phone(c.phone_primary) = p.phone
    UNION ALL
    SELECT c.id, c.business_name, p.phone
    FROM phones p JOIN public.clients c
      ON c.phone_secondary IS NOT NULL AND public.top_customer_phone(c.phone_secondary) = p.phone
  ), compatible_fichas AS MATERIALIZED (
    SELECT DISTINCT c.id, o.client_id AS other_id
    FROM key_phones c JOIN other_phones o USING (phone)
    CROSS JOIN LATERAL (
      SELECT regexp_split_to_array(translate(lower(coalesce(o.business_name, '')), 'áéíóúü', 'aeiouu'), '[^[:alnum:]]+') AS name_parts
    ) names
    CROSS JOIN LATERAL (
      SELECT count(DISTINCT token) FILTER (WHERE token = ANY(names.name_parts)) AS shared,
        count(DISTINCT token) AS total
      FROM unnest(c.name_parts) token
      WHERE char_length(token) >= 3 AND token NOT IN ('cliente', 'sra', 'srta')
    ) own_name
    WHERE o.client_id <> c.id AND own_name.shared >= 2 AND (
      own_name.shared = own_name.total OR NOT EXISTS (
        SELECT FROM unnest(names.name_parts) token
        WHERE char_length(token) >= 3 AND token NOT IN ('cliente', 'sra', 'srta')
          AND token <> ALL(c.name_parts)
      )
    )
  ), candidate_clients AS (
    SELECT id FROM client_keys UNION SELECT other_id FROM compatible_fichas
  ), first_days AS MATERIALIZED (
    SELECT o.client_id, min(o.order_date) AS first_day
    FROM public.orders o JOIN candidate_clients c ON c.id = o.client_id
    WHERE o.employee_withdrawal IS NOT TRUE
      AND o.status IS DISTINCT FROM 'Cancelado' AND o.status IS DISTINCT FROM 'Anulado'
      AND o.order_date BETWEEN DATE '2000-01-01' AND (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    GROUP BY o.client_id
  ), linked_days AS (
    SELECT c.id, min(d.first_day) AS first_day
    FROM compatible_fichas c JOIN first_days d ON d.client_id = c.other_id
    GROUP BY c.id
  )
  SELECT coalesce(jsonb_object_agg(c.id, least(d.first_day, l.first_day)), '{}'::jsonb) INTO result
  FROM client_keys c JOIN first_days d ON d.client_id = c.id
  LEFT JOIN linked_days l ON l.id = c.id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_customer_first_sale(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_customer_first_sale(uuid[]) TO authenticated;

COMMIT;
