-- Migration V78: marca comercial independiente del canal de venta

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS commercial_brand text NOT NULL DEFAULT 'zono';

ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_commercial_brand_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_commercial_brand_check
CHECK (commercial_brand IN ('zono', 'aquafort'));

COMMENT ON COLUMN public.orders.commercial_brand IS
'Marca que debe mostrarse en comprobantes operativos, independiente de si el precio es minorista o mayorista.';

-- Los pedidos mayoristas históricos ya se emitían comercialmente como AquaFort.
UPDATE public.orders
SET commercial_brand = 'aquafort'
WHERE channel = 'mayorista';
