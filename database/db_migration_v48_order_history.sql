-- Migration v48: Crear tabla de historial de modificaciones de pedidos
-- Ejecutar usando run_sql.js

CREATE TABLE IF NOT EXISTS public.order_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    changed_by_id UUID NOT NULL REFERENCES auth.users(id),
    changed_by_name TEXT NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    change_reason TEXT NOT NULL,
    original_data JSONB NOT NULL,
    modified_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- Crear políticas
DROP POLICY IF EXISTS "Allow authenticated users to view order_history" ON public.order_history;
CREATE POLICY "Allow authenticated users to view order_history" ON public.order_history
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to insert order_history" ON public.order_history;
CREATE POLICY "Allow authenticated users to insert order_history" ON public.order_history
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Crear índice para búsquedas rápidas por pedido
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON public.order_history(order_id);
