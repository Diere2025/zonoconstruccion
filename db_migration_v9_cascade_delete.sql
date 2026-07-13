-- Migration V9: Asegurar eliminación en cascada de zonas y corregir restricciones restrictivas
-- Ejecutar en el SQL Editor de Supabase

-- 1. Corregir relación en public.localities (debe ser ON DELETE CASCADE)
-- En migraciones iniciales de v2 figuraba como ON DELETE RESTRICT, lo que impedía borrar zonas con localidades asignadas.
ALTER TABLE public.localities DROP CONSTRAINT IF EXISTS localities_zone_id_fkey;
ALTER TABLE public.localities ADD CONSTRAINT localities_zone_id_fkey 
    FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;

-- 2. Corregir relación en public.orders (debe ser ON DELETE SET NULL)
-- Esto evita que borrar una zona afecte la persistencia de pedidos históricos, simplemente marcando la zona como NULL.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_logistics_zone_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_zone_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_logistics_zone_id_fkey 
    FOREIGN KEY (logistics_zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;

-- 3. Corregir relación en public.zone_delivery_rules (debe ser ON DELETE CASCADE)
ALTER TABLE public.zone_delivery_rules DROP CONSTRAINT IF EXISTS zone_delivery_rules_zone_id_fkey;
ALTER TABLE public.zone_delivery_rules ADD CONSTRAINT zone_delivery_rules_zone_id_fkey 
    FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;
