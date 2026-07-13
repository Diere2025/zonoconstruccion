-- Migration V12: Agregar días de reparto estructurados a la tabla zones
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS delivery_days INTEGER[] DEFAULT '{}';

-- Actualizar registros semilla existentes con sus días correspondientes
UPDATE public.zones SET delivery_days = '{1, 2, 3, 4, 5}' WHERE name = 'CABA';
UPDATE public.zones SET delivery_days = '{2, 4}' WHERE name = 'Zona Norte';
UPDATE public.zones SET delivery_days = '{1, 3}' WHERE name = 'Zona Oeste';
UPDATE public.zones SET delivery_days = '{5}' WHERE name = 'Zona Sur';
UPDATE public.zones SET delivery_days = '{6}' WHERE name = 'La Plata';
