-- Alter public.suppliers to add spreadsheet columns
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS business_unit text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contacts text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS locality text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS gps_location text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS delivery_time_text text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS main_products text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
