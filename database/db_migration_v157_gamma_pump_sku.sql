BEGIN;

-- This imported product uses its complete commercial name as SKU.
DO $$
DECLARE
  product_id constant uuid := '670bf0b6-26f1-491b-a3d1-9dff2cce35a1';
  product_name constant text := 'Gamma - Bomba periferica Agua 1/2Hp (G2783AR)';
BEGIN
  PERFORM 1 FROM products
  WHERE id = product_id AND name = product_name
    AND sku IN ('AUTO-SBVEKV', product_name)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gamma pump does not match the expected product';
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE id <> product_id AND sku = product_name) THEN
    RAISE EXCEPTION 'Gamma pump SKU already belongs to another product';
  END IF;
  IF EXISTS (SELECT 1 FROM price_list_items WHERE sku = 'AUTO-SBVEKV')
    OR EXISTS (SELECT 1 FROM scheduled_price_updates WHERE sku = 'AUTO-SBVEKV')
    OR EXISTS (SELECT 1 FROM sales_quote_items WHERE sku = 'AUTO-SBVEKV') THEN
    RAISE EXCEPTION 'Review references to the old Gamma pump SKU before renaming';
  END IF;
  UPDATE products SET sku = product_name
  WHERE id = product_id AND sku = 'AUTO-SBVEKV';
END $$;

COMMIT;
