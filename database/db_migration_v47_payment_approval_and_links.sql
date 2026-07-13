-- Migration v47: Agregar columna de aprobación de pago en pedidos y actualizar históricos
-- Ejecutar usando run_sql.js

-- 1. Agregar columna payment_approved a la tabla orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_approved BOOLEAN NOT NULL DEFAULT false;

-- 2. Marcar como aprobados los pedidos que ya estén entregados o cuyo estado de pago sea Abonado
UPDATE public.orders 
SET payment_approved = true 
WHERE status = 'Entregado' OR payment_status = 'Abonado';

-- 3. Crear índice para optimizar consultas de logística y finanzas
CREATE INDEX IF NOT EXISTS idx_orders_payment_approved ON public.orders(payment_approved);
