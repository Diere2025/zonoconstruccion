-- 0. Crear tablas public.zones y public.localities si no existen
CREATE TABLE IF NOT EXISTS public.zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    delivery_schedule TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    zone_id UUID REFERENCES public.zones(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT localities_name_zone_key UNIQUE (name, zone_id)
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad para zones
DROP POLICY IF EXISTS "Everyone authenticated can read zones" ON public.zones;
CREATE POLICY "Everyone authenticated can read zones" ON public.zones
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage zones" ON public.zones;
CREATE POLICY "Admins can manage zones" ON public.zones
    FOR ALL TO authenticated USING (public.is_admin());

-- Políticas de Seguridad para localities
DROP POLICY IF EXISTS "Everyone authenticated can read localities" ON public.localities;
CREATE POLICY "Everyone authenticated can read localities" ON public.localities
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage localities" ON public.localities;
CREATE POLICY "Admins can manage localities" ON public.localities
    FOR ALL TO authenticated USING (public.is_admin());

-- 1. Agregar columna de cronograma a la tabla de zones
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS delivery_schedule TEXT;

-- 2. Asegurar restricción de unicidad en localities para evitar duplicación en re-ejecuciones
ALTER TABLE public.localities DROP CONSTRAINT IF EXISTS localities_name_zone_key;
ALTER TABLE public.localities ADD CONSTRAINT localities_name_zone_key UNIQUE (name, zone_id);

-- 3. Limpiar e Insertar Zonas
INSERT INTO public.zones (id, name, delivery_schedule, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'CABA', 'Lunes a Viernes', true),
('a0000000-0000-0000-0000-000000000002', 'Zona Norte', 'Martes y Jueves', true),
('a0000000-0000-0000-0000-000000000003', 'Zona Oeste', 'Lunes y Miércoles', true),
('a0000000-0000-0000-0000-000000000004', 'Zona Sur', 'Viernes', true),
('a0000000-0000-0000-0000-000000000005', 'La Plata', 'Sábados', true)
ON CONFLICT (name) DO UPDATE 
SET delivery_schedule = EXCLUDED.delivery_schedule, is_active = EXCLUDED.is_active;

-- 4. Insertar Localidades por Zona
-- CABA Localities
INSERT INTO public.localities (name, zone_id, is_active) VALUES
('Palermo', 'a0000000-0000-0000-0000-000000000001', true),
('Belgrano', 'a0000000-0000-0000-0000-000000000001', true),
('Flores', 'a0000000-0000-0000-0000-000000000001', true),
('Caballito', 'a0000000-0000-0000-0000-000000000001', true),
('Villa Urquiza', 'a0000000-0000-0000-0000-000000000001', true),
('Recoleta', 'a0000000-0000-0000-0000-000000000001', true),
('Devoto', 'a0000000-0000-0000-0000-000000000001', true),
('San Telmo', 'a0000000-0000-0000-0000-000000000001', true)
ON CONFLICT (name, zone_id) DO NOTHING;

-- Zona Norte Localities
INSERT INTO public.localities (name, zone_id, is_active) VALUES
('Vicente López', 'a0000000-0000-0000-0000-000000000002', true),
('San Isidro', 'a0000000-0000-0000-0000-000000000002', true),
('Tigre', 'a0000000-0000-0000-0000-000000000002', true),
('San Fernando', 'a0000000-0000-0000-0000-000000000002', true),
('Pilar', 'a0000000-0000-0000-0000-000000000002', true),
('Escobar', 'a0000000-0000-0000-0000-000000000002', true),
('Olivos', 'a0000000-0000-0000-0000-000000000002', true)
ON CONFLICT (name, zone_id) DO NOTHING;

-- Zona Oeste Localities
INSERT INTO public.localities (name, zone_id, is_active) VALUES
('Morón', 'a0000000-0000-0000-0000-000000000003', true),
('Ramos Mejía', 'a0000000-0000-0000-0000-000000000003', true),
('Merlo', 'a0000000-0000-0000-0000-000000000003', true),
('Moreno', 'a0000000-0000-0000-0000-000000000003', true),
('Ituzaingó', 'a0000000-0000-0000-0000-000000000003', true),
('San Justo', 'a0000000-0000-0000-0000-000000000003', true),
('Tres de Febrero', 'a0000000-0000-0000-0000-000000000003', true)
ON CONFLICT (name, zone_id) DO NOTHING;

-- Zona Sur Localities
INSERT INTO public.localities (name, zone_id, is_active) VALUES
('Avellaneda', 'a0000000-0000-0000-0000-000000000004', true),
('Lanús', 'a0000000-0000-0000-0000-000000000004', true),
('Quilmes', 'a0000000-0000-0000-0000-000000000004', true),
('Lomas de Zamora', 'a0000000-0000-0000-0000-000000000004', true),
('Berazategui', 'a0000000-0000-0000-0000-000000000004', true),
('Almirante Brown', 'a0000000-0000-0000-0000-000000000004', true)
ON CONFLICT (name, zone_id) DO NOTHING;

-- La Plata Localities
INSERT INTO public.localities (name, zone_id, is_active) VALUES
('La Plata Centro', 'a0000000-0000-0000-0000-000000000005', true),
('Gonnet', 'a0000000-0000-0000-0000-000000000005', true),
('City Bell', 'a0000000-0000-0000-0000-000000000005', true),
('Villa Elisa', 'a0000000-0000-0000-0000-000000000005', true)
ON CONFLICT (name, zone_id) DO NOTHING;
