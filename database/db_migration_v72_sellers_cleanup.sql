-- Migration V72: Sellers cleanup and deduplication
-- 1. Marcar como inactivos a Mariano Bravo y Belén Romero (ya no forman parte activa del equipo comercial)
-- 2. Consolidar a Facundo Paz (unificar el usuario duplicado facundo.paz@zono.com.ar hacia su cuenta activa facundopaz@zono.com.ar)

-- 1. Reasignar todos los pedidos del ID duplicado de Facundo Paz al ID canónico y activo
UPDATE public.orders
SET seller_id = '3820a0fe-bb0a-4a84-ad85-79e49868cad7'
WHERE seller_id = '54b9ce55-7354-4b39-9886-314aa79f6aa6';

-- 2. Eliminar asignaciones de líneas telefónicas para el ID duplicado de Facundo Paz
DELETE FROM public.seller_phone_lines
WHERE seller_id = '54b9ce55-7354-4b39-9886-314aa79f6aa6';

-- 3. Eliminar el registro duplicado de Facundo Paz en la tabla sellers
DELETE FROM public.sellers
WHERE id = '54b9ce55-7354-4b39-9886-314aa79f6aa6';

-- 4. Desactivar a Mariano Bravo y Belén Romero
UPDATE public.sellers
SET is_active = false
WHERE id IN (
  'f83f2bb3-d9d5-4c8c-9c9a-acc6d0dc6d9c', -- Mariano Bravo
  'ab8cef0f-7d13-4648-9b22-220d568f21ba'  -- Belén Romero
);

-- 5. Desvincular líneas telefónicas asignadas a Mariano Bravo
DELETE FROM public.seller_phone_lines
WHERE seller_id = 'f83f2bb3-d9d5-4c8c-9c9a-acc6d0dc6d9c';
