-- Agregar columna delivery_notes a la tabla addresses
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

-- Agregar columna delivery_notes a la tabla orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
