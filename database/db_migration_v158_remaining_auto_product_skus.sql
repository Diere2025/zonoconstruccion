BEGIN;

-- Remaining imported commercial products use their full names as SKUs.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('4d9a8390-7317-45d0-a6ba-6d088af83961'::uuid, 'Powerlit CISTERNA 470L', 'AUTO-KHCC0Z'),
    ('8399e3a5-f237-488f-86e7-50b64163f876'::uuid, 'Sirena - Calefactor s/Salida 3000 kcal (CA3000)', 'AUTO-COMP-QQ04UK')
  ) AS targets(id, name, old_sku)
  LOOP
    PERFORM 1 FROM products p
    WHERE p.id = target.id AND p.name = target.name AND p.sku IN (target.old_sku, target.name)
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product does not match expected data: %', target.id;
    END IF;
    IF EXISTS (SELECT 1 FROM products p WHERE p.id <> target.id AND p.sku = target.name) THEN
      RAISE EXCEPTION 'SKU already belongs to another product: %', target.name;
    END IF;
    IF EXISTS (SELECT 1 FROM price_list_items WHERE sku = target.old_sku)
      OR EXISTS (SELECT 1 FROM scheduled_price_updates WHERE sku = target.old_sku)
      OR EXISTS (SELECT 1 FROM sales_quote_items WHERE sku = target.old_sku) THEN
      RAISE EXCEPTION 'Review references to old SKU: %', target.old_sku;
    END IF;
    UPDATE products SET sku = target.name WHERE id = target.id AND sku = target.old_sku;
  END LOOP;
END $$;

COMMIT;
