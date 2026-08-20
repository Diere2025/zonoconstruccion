-- Migration V23: Agregar categoría al pedido para atribución de marketing
-- Ejecutar en el SQL Editor de Supabase en el esquema public

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS category TEXT;

-- Clasificar pedidos existentes basándose en los nombres de sus productos/ítems
UPDATE public.orders o
SET category = sub.new_cat
FROM (
  SELECT 
    oi.order_id,
    CASE 
      WHEN bool_or(lower(oi.product_name) LIKE '%aquafort%' OR lower(p.name) LIKE '%aquafort%') THEN 'Tanques de Agua'
      WHEN bool_or(lower(oi.product_name) LIKE '%biofort%' OR lower(p.name) LIKE '%biofort%') THEN 'Biodigestores'
      WHEN bool_or(lower(oi.product_name) LIKE '%meps%' OR lower(oi.product_name) LIKE '%equilibrio%' OR lower(p.name) LIKE '%meps%' OR lower(p.name) LIKE '%equilibrio%') THEN 'MEPS'
      WHEN bool_or(lower(oi.product_name) LIKE '%escalera%' OR lower(p.name) LIKE '%escalera%') THEN 'Escaleras'
      ELSE 'Otros'
    END AS new_cat
  FROM public.order_items oi
  LEFT JOIN public.products p ON oi.product_id = p.id
  GROUP BY oi.order_id
) sub
WHERE o.id = sub.order_id AND (o.category IS NULL OR o.category = '');
