-- ==============================================================================
-- Migration v45: Payway Payment Methods with Surcharges (1, 3, 6, 12 cuotas)
-- ==============================================================================

INSERT INTO public.payment_methods (id, name, surcharge_percentage, installments, is_active, is_default)
VALUES 
  (gen_random_uuid(), 'Payway1 (Sept-26)', 13.50, 1, true, false),
  (gen_random_uuid(), 'Payway3 (Sept-26)', 32.00, 3, true, false),
  (gen_random_uuid(), 'Payway6 (Sept-26)', 43.20, 6, true, false),
  (gen_random_uuid(), 'Payway12 (Sept-26)', 61.40, 12, true, false)
ON CONFLICT (id) DO NOTHING;
