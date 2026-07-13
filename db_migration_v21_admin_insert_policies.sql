-- Migration V21: Permitir a los administradores insertar pedidos, order_items y localidades
-- Ejecutar para dar permisos de importación a usuarios con rol de administrador

-- 1. Políticas para orders
DROP POLICY IF EXISTS "Admins can insert all orders" ON public.orders;
CREATE POLICY "Admins can insert all orders" ON public.orders
    FOR INSERT WITH CHECK (public.is_admin());

-- 2. Políticas para order_items
DROP POLICY IF EXISTS "Admins can insert all order items" ON public.order_items;
CREATE POLICY "Admins can insert all order items" ON public.order_items
    FOR INSERT WITH CHECK (public.is_admin());

-- 3. Políticas para localities
DROP POLICY IF EXISTS "Admins can manage localities" ON public.localities;
CREATE POLICY "Admins can manage localities" ON public.localities
    FOR ALL USING (public.is_admin());
