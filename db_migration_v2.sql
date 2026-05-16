-- Migration V2: Zonas, Tiempos de Entrega y Roles
-- Ejecutar en el SQL Editor de Supabase

-- 1. Actualización de tabla Sellers para incluir 'role' (seller o admin)
-- Si la tabla sellers ya existe del script anterior, solo agregamos la columna:
ALTER TABLE IF EXISTS sellers 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'seller';

-- 2. Tabla de Zonas (Zones)
CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Reglas de Entrega por Zona (Zone Delivery Rules)
-- Define tiempos de entrega específicos por categoría de producto
CREATE TABLE IF NOT EXISTS zone_delivery_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
    product_category TEXT NOT NULL, -- ej. "Tanques", "Accesorios"
    delivery_time TEXT NOT NULL, -- ej. "1 a 4 días hábiles"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(zone_id, product_category)
);

-- 4. Modificación de Localidades
-- Eliminamos las tablas viejas o si es nueva la creamos con la relación a zones
DROP TABLE IF EXISTS localities CASCADE;

CREATE TABLE localities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    zone_id UUID REFERENCES zones(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS Policies
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_delivery_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE localities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read zones" ON zones FOR SELECT USING (true);
CREATE POLICY "Anyone can read zone_delivery_rules" ON zone_delivery_rules FOR SELECT USING (true);
CREATE POLICY "Anyone can read localities" ON localities FOR SELECT USING (true);
