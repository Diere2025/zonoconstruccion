BEGIN;

CREATE OR REPLACE FUNCTION public.employee_withdrawal_saved_addresses(p_employee uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE capabilities jsonb := public.employee_withdrawal_capabilities();
BEGIN
  IF NOT coalesce((capabilities->>'create')::boolean,false) OR
    (NOT coalesce((capabilities->>'logistics')::boolean,false)
      AND p_employee IS DISTINCT FROM (capabilities->>'employee_id')::uuid) THEN
    RAISE EXCEPTION 'No podés consultar los domicilios de ese empleado.' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',id,'address',address,'locality',locality,
      'phone',phone,'maps_link',google_maps_link) ORDER BY created_at DESC,id)
    FROM (
      SELECT * FROM (
        SELECT DISTINCT ON (lower(trim(o.address)),lower(trim(o.locality))) o.id,o.address,o.locality,
          o.google_maps_link,o.totals->>'delivery_phone' AS phone,o.created_at
        FROM public.employee_withdrawals w JOIN public.orders o ON o.id=w.order_id
        WHERE w.employee_id=p_employee AND w.state IN ('pending','approved') AND o.employee_delivery_mode='home'
          AND nullif(trim(o.address),'') IS NOT NULL AND nullif(trim(o.locality),'') IS NOT NULL
        ORDER BY lower(trim(o.address)),lower(trim(o.locality)),o.created_at DESC,o.id
      ) addresses ORDER BY created_at DESC,id LIMIT 10
    ) latest
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.employee_withdrawal_saved_addresses(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_saved_addresses(uuid) TO authenticated;

COMMIT;
