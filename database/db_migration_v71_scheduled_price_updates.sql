-- Migration V71: Scheduled Price Updates (Precios Programados)
-- Permite programar aumentos o cambios de precios con una fecha futura de vigencia (similar a la hoja 'PVP por Fecha' de Google Sheets)

-- 1. Tabla de Precios Programados
CREATE TABLE IF NOT EXISTS public.scheduled_price_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    price NUMERIC NOT NULL,
    effective_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
    applied_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Índices para búsquedas y procesamiento rápido
CREATE INDEX IF NOT EXISTS idx_scheduled_price_updates_status ON public.scheduled_price_updates(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_price_updates_date ON public.scheduled_price_updates(effective_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_price_updates_product ON public.scheduled_price_updates(product_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_price_updates_name ON public.scheduled_price_updates(product_name);

-- 2. Función SQL para aplicar todas las actualizaciones de precios cuya fecha de vigencia ya haya llegado
CREATE OR REPLACE FUNCTION public.apply_scheduled_price_updates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count integer := 0;
    r RECORD;
BEGIN
    FOR r IN 
        SELECT id, product_id, product_name, sku, price 
        FROM public.scheduled_price_updates 
        WHERE status = 'pending' 
          AND effective_date <= CURRENT_DATE
        ORDER BY effective_date ASC, created_at ASC
    LOOP
        -- 1. Intentar actualizar por product_id si está asociado
        IF r.product_id IS NOT NULL THEN
            UPDATE public.products 
            SET price = r.price
            WHERE id = r.product_id;
        ELSE
            -- 2. Si no tiene product_id directo, buscar por coincidencia en SKU o Nombre
            UPDATE public.products 
            SET price = r.price
            WHERE LOWER(TRIM(name)) = LOWER(TRIM(r.product_name)) 
               OR (r.sku IS NOT NULL AND LOWER(TRIM(sku)) = LOWER(TRIM(r.sku)))
               OR LOWER(TRIM(sku)) = LOWER(TRIM(r.product_name));
        END IF;

        -- Marcar la programación como aplicada
        UPDATE public.scheduled_price_updates 
        SET status = 'applied', 
            applied_at = timezone('utc'::text, now()), 
            updated_at = timezone('utc'::text, now())
        WHERE id = r.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- 3. Habilitar RLS y políticas permisivas para lectura y gestión
ALTER TABLE public.scheduled_price_updates ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public and authenticated read scheduled prices" ON public.scheduled_price_updates;
    CREATE POLICY "Public and authenticated read scheduled prices" 
    ON public.scheduled_price_updates 
    FOR SELECT 
    USING (true);

    DROP POLICY IF EXISTS "Authenticated and service role manage scheduled prices" ON public.scheduled_price_updates;
    CREATE POLICY "Authenticated and service role manage scheduled prices" 
    ON public.scheduled_price_updates 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);
END $$;
