-- Migration V69: Wholesale Clients and Historical Structure
-- Permite estructurar clientes mayoristas con sucursales/direcciones y registro de descuentos sin ensuciar catálogo activo

-- 1. Asegurar columnas de descuento y tipo en clients
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS default_discount_label TEXT,
ADD COLUMN IF NOT EXISTS default_discount_coef NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS client_type TEXT DEFAULT 'Mayorista',
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Asegurar campos en addresses para sucursales mayoristas
ALTER TABLE public.addresses
ADD COLUMN IF NOT EXISTS code TEXT,
ADD COLUMN IF NOT EXISTS zone TEXT,
ADD COLUMN IF NOT EXISTS schedule TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- 3. Índices para búsqueda rápida de sucursales y códigos
CREATE INDEX IF NOT EXISTS idx_clients_internal_code ON public.clients(internal_code);
CREATE INDEX IF NOT EXISTS idx_addresses_code ON public.addresses(code);
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON public.addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON public.orders(channel);
