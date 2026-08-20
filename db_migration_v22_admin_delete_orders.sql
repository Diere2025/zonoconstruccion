-- Migration V22: Permitir a los administradores eliminar pedidos y sus items
-- Ejecutar para dar permisos de eliminación a usuarios con rol de administrador

DROP POLICY IF EXISTS "Admins can delete all orders" ON public.orders;
CREATE POLICY "Admins can delete all orders" ON public.orders
    FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete all order items" ON public.order_items;
CREATE POLICY "Admins can delete all order items" ON public.order_items
    FOR DELETE USING (public.is_admin());
