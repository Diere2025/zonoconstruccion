-- Ejecutar en el SQL Editor de Supabase
-- Arreglo de permisos RLS para que los Admins puedan ver todos los kits correctamente

DROP POLICY IF EXISTS "Users can read global or their own kits" ON kits;

CREATE POLICY "Users can read global or their own kits" ON kits
    FOR SELECT USING (
        is_global = true OR 
        seller_id = auth.uid() OR 
        (SELECT role FROM sellers WHERE id = auth.uid()) = 'admin'
    );
