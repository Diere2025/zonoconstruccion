-- Migration v42: Soporte para múltiples zonas en tarifas de fleteros
-- Ejecutar usando run_sql.js

ALTER TABLE public.carrier_rates ADD COLUMN IF NOT EXISTS logistics_zone_ids UUID[];

-- Migrar datos existentes: si logistics_zone_id está configurado, pasarlo al array logistics_zone_ids
UPDATE public.carrier_rates
SET logistics_zone_ids = ARRAY[logistics_zone_id]
WHERE logistics_zone_id IS NOT NULL AND logistics_zone_ids IS NULL;
