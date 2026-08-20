-- Add discount coefficients and surcharge fields to public.suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS discount_1 numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS discount_2 numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS surcharges numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS discount_cash numeric DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bonus_coef numeric DEFAULT 1.0;
