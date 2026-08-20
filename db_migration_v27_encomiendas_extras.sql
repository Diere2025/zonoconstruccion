-- Alter encomiendas table to add supplier details, payment amount, and attachment fields
ALTER TABLE public.encomiendas ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.encomiendas ADD COLUMN IF NOT EXISTS payment_amount numeric(12, 2) DEFAULT 0.00;
ALTER TABLE public.encomiendas ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.encomiendas ADD COLUMN IF NOT EXISTS receipt_notes text;
