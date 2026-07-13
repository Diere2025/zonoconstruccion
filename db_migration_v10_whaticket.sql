-- db_migration_v10_whaticket.sql
-- Agregar columna whaticket_link a la tabla orders para guardar el enlace de Whaticket de la venta

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS whaticket_link TEXT;
