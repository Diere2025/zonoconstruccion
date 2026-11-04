-- Preserve the installed orphan-linking behavior for normal products.
-- A unique physical unit must never silently adopt historical orphan lines.
BEGIN;
DO $guard$
DECLARE definition text;
BEGIN
 IF to_regprocedure('public.link_order_items_on_product_create()') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.link_order_items_on_product_create()'::regprocedure) INTO definition;
  IF position('NEW.is_outlet_unit' IN definition)=0 THEN
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n IF NEW.is_outlet_unit THEN RETURN NEW; END IF;','i');
   EXECUTE definition;
  END IF;
 END IF;
END;
$guard$;
COMMIT;
