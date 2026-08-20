-- Migration V6: Tabla de Tiempos de Entrega Configurables
-- Ejecutar en el SQL Editor de Supabase

-- 1. Crear la tabla de tiempos de entrega
CREATE TABLE IF NOT EXISTS public.delivery_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Regular', 'Zonal', 'Particular', 'Express')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE public.delivery_times ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Seguridad
-- Permite lectura a todos los usuarios autenticados
DROP POLICY IF EXISTS select_delivery_times ON public.delivery_times;
CREATE POLICY select_delivery_times ON public.delivery_times 
    FOR SELECT USING (auth.role() = 'authenticated');

-- Permite cualquier operación (Insert/Update/Delete) solo a administradores
DROP POLICY IF EXISTS admin_all_delivery_times ON public.delivery_times;
CREATE POLICY admin_all_delivery_times ON public.delivery_times
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.sellers
            WHERE sellers.id = auth.uid() AND sellers.role = 'admin'
        )
    );

-- 4. Insertar Registros Semilla Iniciales
INSERT INTO public.delivery_times (name, description, category, is_active) VALUES
('Regular 1', '1 a 3 días hábiles', 'Regular', true),
('Regular 2', '1 a 4 días hábiles', 'Regular', true),
('La Plata', 'Sábados', 'Zonal', true),
('CABA', 'Miércoles y Sábados', 'Zonal', true),
('Día Particular', 'Pactado vendedor/cliente', 'Particular', true),
('Express', 'Reparto rápido prioritario', 'Express', true)
ON CONFLICT (name) DO UPDATE 
SET description = EXCLUDED.description, category = EXCLUDED.category, is_active = EXCLUDED.is_active;
