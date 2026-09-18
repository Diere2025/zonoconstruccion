-- Migration V77: capacidad mayorista por vendedor
-- Permite que un vendedor opere B2C y B2B sin cambiar seller_type.

ALTER TABLE public.sellers
ADD COLUMN IF NOT EXISTS can_sell_wholesale boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sellers.can_sell_wholesale IS
'Habilita pedidos, clientes y cotizador mayorista sin modificar el canal principal del vendedor.';

-- Conservar habilitados los vendedores cuyo canal principal ya era mayorista.
UPDATE public.sellers
SET can_sell_wholesale = true
WHERE seller_type = 'mayorista';

-- Facundo vende por ambos canales: conserva seller_type=minorista y suma B2B.
UPDATE public.sellers
SET can_sell_wholesale = true
WHERE id = '3820a0fe-bb0a-4a84-ad85-79e49868cad7';
