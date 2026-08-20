-- Migration V13: Asociar días de reparto a los Tipos de Entrega (delivery_times) en lugar de Zonas
ALTER TABLE public.zones DROP COLUMN IF EXISTS delivery_days;

ALTER TABLE public.delivery_times ADD COLUMN IF NOT EXISTS delivery_days INTEGER[] DEFAULT '{}';

-- Actualizar registros existentes en delivery_times con días correspondientes
UPDATE public.delivery_times SET delivery_days = '{6}' WHERE name = 'La Plata';
UPDATE public.delivery_times SET delivery_days = '{3, 6}' WHERE name = 'CABA';
UPDATE public.delivery_times SET delivery_days = '{1, 2, 3, 4, 5}' WHERE name = 'Regular 1';
UPDATE public.delivery_times SET delivery_days = '{1, 2, 3, 4, 5}' WHERE name = 'Regular 2';
UPDATE public.delivery_times SET delivery_days = '{1, 2, 3, 4, 5}' WHERE name = 'Express';
UPDATE public.delivery_times SET delivery_days = '{1, 2, 3, 4, 5, 6, 0}' WHERE name = 'Día Particular';
