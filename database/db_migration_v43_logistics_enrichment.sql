-- Migration V43: Enriquecimiento de logística y códigos de recorrido
-- Ejecutar usando: node run_sql.js database/db_migration_v43_logistics_enrichment.sql

-- 1. Agregar columna de código único a las hojas de ruta (route_sheets)
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

-- 2. Agregar columnas adicionales de logística a las entregas (deliveries)
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS real_delivery_date DATE;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS logistics_contact TEXT;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS predominant_zone TEXT;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS companion TEXT;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS driver_hours TEXT;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS companion_hours TEXT;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS failure_reason TEXT;
