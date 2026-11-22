BEGIN;

CREATE OR REPLACE FUNCTION public.find_sheet_order_codes_in_erp(p_codes text[])
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH settings AS (
        SELECT U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' AS whitespace
    ), matches AS (
        SELECT DISTINCT candidate.code
        FROM public.orders AS o
        CROSS JOIN settings
        CROSS JOIN LATERAL (SELECT upper(btrim(o.legacy_code, settings.whitespace)) AS code) AS full_code
        CROSS JOIN LATERAL unnest(
            ARRAY[full_code.code] || string_to_array(replace(full_code.code, ',', '/'), '/')
        ) AS parts(code)
        CROSS JOIN LATERAL (SELECT btrim(parts.code, settings.whitespace) AS code) AS normalized
        CROSS JOIN LATERAL unnest(
            ARRAY[normalized.code, CASE WHEN starts_with(normalized.code, 'ORIG-') THEN substr(normalized.code, 6) END]
        ) AS erp_code(code)
        JOIN unnest(p_codes) AS candidate(code) ON candidate.code = erp_code.code
        WHERE o.legacy_code IS NOT NULL
          AND erp_code.code <> ''
    )
    SELECT coalesce(array_agg(code), ARRAY[]::text[])
    FROM matches;
$$;

REVOKE ALL ON FUNCTION public.find_sheet_order_codes_in_erp(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_sheet_order_codes_in_erp(text[]) TO service_role;

COMMIT;
