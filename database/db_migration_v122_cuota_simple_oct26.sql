BEGIN;

-- Retain historical IDs for existing orders; retire them from new selections.
UPDATE public.payment_methods
SET is_active = false, is_default = false
WHERE name ILIKE '%payway%' OR name ILIKE '%cuota simple%';

-- Exact names match BD Recargos in the order spreadsheets.
INSERT INTO public.payment_methods (id, name, surcharge_percentage, installments, is_active, is_default)
SELECT gen_random_uuid(), plan.name, plan.rate, plan.installments, true, false
FROM (VALUES
  ('Cuota Simple x2 (oct26)', 22.00, 2),
  ('Cuota Simple x3 (oct26)', 28.00, 3),
  ('Cuota Simple x6 (oct26)', 45.50, 6)
) AS plan(name, rate, installments)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods method WHERE method.name = plan.name);

UPDATE public.payment_methods method
SET surcharge_percentage = plan.rate, installments = plan.installments, is_active = true, is_default = false
FROM (VALUES
  ('Cuota Simple x2 (oct26)', 22.00, 2),
  ('Cuota Simple x3 (oct26)', 28.00, 3),
  ('Cuota Simple x6 (oct26)', 45.50, 6)
) AS plan(name, rate, installments)
WHERE method.name = plan.name;

COMMIT;
