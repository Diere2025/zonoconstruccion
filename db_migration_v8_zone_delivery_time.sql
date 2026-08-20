-- Migration V8: Relacionar Zonas con Tipos de Entrega (delivery_times)
-- Ejecutar en el SQL Editor de Supabase

-- 1. Agregar columna delivery_time_id a la tabla de zones
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS delivery_time_id UUID REFERENCES public.delivery_times(id) ON DELETE SET NULL;

-- 2. Migrar registros iniciales haciendo coincidir con los Tipos de Entrega semilla
UPDATE public.zones 
SET delivery_time_id = (SELECT id FROM public.delivery_times WHERE name = 'La Plata' LIMIT 1)
WHERE name = 'La Plata';

UPDATE public.zones 
SET delivery_time_id = (SELECT id FROM public.delivery_times WHERE name = 'CABA' LIMIT 1)
WHERE name = 'CABA' OR name = 'Microcentro (CABA)';

UPDATE public.zones 
SET delivery_time_id = (SELECT id FROM public.delivery_times WHERE name = 'Regular 1' LIMIT 1)
WHERE delivery_time_id IS NULL AND name NOT IN ('Depósito');
