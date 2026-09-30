BEGIN;

INSERT INTO public.payment_methods (id, name, surcharge_percentage, installments, is_active, is_default)
SELECT gen_random_uuid(), plan.name, plan.rate, plan.installments, true, false
FROM (VALUES
  ('Cuota Simple x9 (oct26)', 70.00, 9),
  ('Cuota Simple x12 (oct26)', 93.00, 12),
  ('Cuota Simple x18 (oct26)', 141.00, 18)
) AS plan(name, rate, installments)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods method WHERE method.name = plan.name);

UPDATE public.payment_methods method
SET surcharge_percentage = plan.rate, installments = plan.installments, is_active = true, is_default = false
FROM (VALUES
  ('Cuota Simple x9 (oct26)', 70.00, 9),
  ('Cuota Simple x12 (oct26)', 93.00, 12),
  ('Cuota Simple x18 (oct26)', 141.00, 18)
) AS plan(name, rate, installments)
WHERE method.name = plan.name;

COMMIT;
