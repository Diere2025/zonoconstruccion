-- 1. Políticas de Clientes para Vendedores
DROP POLICY IF EXISTS "Sellers can update clients" ON public.clients;
CREATE POLICY "Sellers can update clients" ON public.clients
    FOR UPDATE USING (auth.role() = 'authenticated');

-- 2. Políticas de Direcciones para Vendedores
DROP POLICY IF EXISTS "Sellers can update addresses" ON public.addresses;
CREATE POLICY "Sellers can update addresses" ON public.addresses
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Sellers can delete addresses" ON public.addresses;
CREATE POLICY "Sellers can delete addresses" ON public.addresses
    FOR DELETE USING (auth.role() = 'authenticated');
