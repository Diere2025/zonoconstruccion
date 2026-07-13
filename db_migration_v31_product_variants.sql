-- Add variant columns to public.products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant_type TEXT DEFAULT 'estandar';
