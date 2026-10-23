BEGIN;
-- Retire card plans without changing historical IDs, rates or existing orders.
UPDATE public.payment_methods SET is_active = false, is_default = false
WHERE name ~* 'payway|cuota\s+simple|posnet|point\s*(1\s*pago|tarjeta)|tarjeta\s+naranja'
  AND name NOT IN ('Posnet x1 (Nov26)', 'Posnet x3 (Nov26)', 'Posnet x6 (Nov26)');

INSERT INTO public.payment_methods (id, name, surcharge_percentage, installments, is_active, is_default)
SELECT gen_random_uuid(), plan.name, plan.rate, plan.installments, true, false
FROM (VALUES ('Posnet x1 (Nov26)', 10, 1), ('Posnet x3 (Nov26)', 25, 3), ('Posnet x6 (Nov26)', 43, 6)) AS plan(name, rate, installments)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods existing WHERE existing.name = plan.name);

UPDATE public.payment_methods AS method
SET surcharge_percentage = plan.rate, installments = plan.installments, is_active = true, is_default = false
FROM (VALUES ('Posnet x1 (Nov26)', 10, 1), ('Posnet x3 (Nov26)', 25, 3), ('Posnet x6 (Nov26)', 43, 6)) AS plan(name, rate, installments)
WHERE method.name = plan.name;
COMMIT;
