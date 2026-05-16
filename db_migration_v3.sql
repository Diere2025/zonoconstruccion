-- Migration V3: Kits de Presupuestos
-- Ejecutar en el SQL Editor de Supabase

-- 1. Tabla de Kits
CREATE TABLE IF NOT EXISTS kits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    detail_text TEXT,
    category TEXT DEFAULT 'Otros',
    seller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_global BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabla de Items de Kits (Productos)
CREATE TABLE IF NOT EXISTS kit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kit_id UUID REFERENCES kits(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL DEFAULT 1,
    custom_price NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Habilitar RLS (Seguridad a Nivel de Fila)
ALTER TABLE kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit_items ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Seguridad para Kits

-- Seleccionar: Los usuarios pueden ver los kits globales (is_global = true) o los que crearon ellos mismos. 
-- Los administradores pueden ver todos.
CREATE POLICY "Users can read global or their own kits" ON kits
    FOR SELECT USING (
        is_global = true OR 
        seller_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM sellers 
            WHERE sellers.id = auth.uid() AND sellers.role = 'admin'
        )
    );

-- Insertar: Cualquier usuario autenticado puede crear un kit
CREATE POLICY "Users can insert kits" ON kits
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Actualizar: Solo el creador o un admin puede editar un kit
CREATE POLICY "Users can update their own kits" ON kits
    FOR UPDATE USING (
        seller_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM sellers 
            WHERE sellers.id = auth.uid() AND sellers.role = 'admin'
        )
    );

-- Eliminar: Solo el creador o un admin puede eliminar un kit
CREATE POLICY "Users can delete their own kits" ON kits
    FOR DELETE USING (
        seller_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM sellers 
            WHERE sellers.id = auth.uid() AND sellers.role = 'admin'
        )
    );

-- 5. Políticas de Seguridad para kit_items
-- Como kit_items pertenece a un kit, heredamos la lógica del select del kit
CREATE POLICY "Anyone can read kit items if they can read the kit" ON kit_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM kits WHERE kits.id = kit_items.kit_id
        )
    );

CREATE POLICY "Users can insert kit items" ON kit_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update kit items" ON kit_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM kits WHERE kits.id = kit_items.kit_id AND (kits.seller_id = auth.uid() OR EXISTS (SELECT 1 FROM sellers WHERE sellers.id = auth.uid() AND sellers.role = 'admin'))
        )
    );

CREATE POLICY "Users can delete kit items" ON kit_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM kits WHERE kits.id = kit_items.kit_id AND (kits.seller_id = auth.uid() OR EXISTS (SELECT 1 FROM sellers WHERE sellers.id = auth.uid() AND sellers.role = 'admin'))
        )
    );
