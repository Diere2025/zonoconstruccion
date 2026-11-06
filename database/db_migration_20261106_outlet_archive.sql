BEGIN;

ALTER TABLE public.outlet_units
  ADD COLUMN archived_at timestamptz,
  ADD CONSTRAINT outlet_archived_withdrawn CHECK (archived_at IS NULL OR state = 'withdrawn'),
  DROP CONSTRAINT outlet_units_code_key;

DROP INDEX public.outlet_code_normalized;
CREATE UNIQUE INDEX outlet_code_normalized ON public.outlet_units (lower(trim(code)))
  WHERE archived_at IS NULL;

CREATE FUNCTION public.outlet_archive_unit(p_id uuid, p_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  unit public.outlet_units;
BEGIN
  IF NOT public.outlet_can_manage() THEN
    RAISE EXCEPTION 'Tu cuenta no puede administrar Segunda y Outlet.';
  END IF;

  SELECT * INTO unit FROM public.outlet_units WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la ficha.';
  END IF;
  IF unit.archived_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF unit.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'La ficha cambió. Actualizala antes de eliminar.';
  END IF;
  IF unit.state NOT IN ('draft', 'available', 'withdrawn')
    OR EXISTS (SELECT 1 FROM public.outlet_assignments WHERE unit_id = p_id)
    OR EXISTS (SELECT 1 FROM public.order_items WHERE product_id = unit.product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar una unidad con historial de pedidos o en revisión.';
  END IF;
  IF unit.base_stock_transferred THEN
    RAISE EXCEPTION 'No se puede eliminar una unidad reclasificada desde el stock del producto base.';
  END IF;

  UPDATE public.outlet_units
  SET archived_at = now(), state = 'withdrawn', physical_present = false
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.outlet_archive_unit(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outlet_archive_unit(uuid, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
