-- Migration v45: Agregar columna de importación y flexibilizar categorías
-- Ejecutar usando run_sql.js

-- 1. Eliminar la restricción de categorías restrictivas
ALTER TABLE public.cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_category_check;

-- 2. Agregar columna para identificar movimientos importados desde planillas
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

-- 3. Crear índice para optimizar la limpieza de importados
CREATE INDEX IF NOT EXISTS idx_cash_transactions_is_imported ON public.cash_transactions(is_imported);
