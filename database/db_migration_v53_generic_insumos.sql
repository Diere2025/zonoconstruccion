-- Migration V53: Insumos Genéricos (Virtuales) y Mapeos Centralizados
-- Ejecutar en el SQL Editor de Supabase o usando run_sql.js

-- 1. Modificar tabla de productos para soportar insumos genéricos
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_generic BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mapped_real_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- 2. Función trigger para sincronizar costos de insumos genéricos
CREATE OR REPLACE FUNCTION public.trg_before_product_generic_cost_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el producto es genérico y tiene un mapeo, forzar su cost_price al del producto real
  IF NEW.is_generic = true AND NEW.mapped_real_product_id IS NOT NULL THEN
    NEW.cost_price := COALESCE((SELECT cost_price FROM public.products WHERE id = NEW.mapped_real_product_id), 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_before_product_generic_cost_sync_trigger ON public.products;
CREATE TRIGGER trg_before_product_generic_cost_sync_trigger
BEFORE INSERT OR UPDATE OF is_generic, mapped_real_product_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_before_product_generic_cost_sync();


-- 3. Función trigger AFTER para propagar costos cuando cambia el costo del producto real
CREATE OR REPLACE FUNCTION public.trg_after_product_real_cost_propagate()
RETURNS TRIGGER AS $$
BEGIN
  -- Si cambia el costo de cualquier producto, actualizar el de los genéricos que lo mapean
  -- Esto a su vez disparará el trigger de actualización del genérico, propagando a sus padres BOM
  IF OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
    UPDATE public.products
    SET cost_price = NEW.cost_price
    WHERE is_generic = true AND mapped_real_product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_product_real_cost_propagate_trigger ON public.products;
CREATE TRIGGER trg_after_product_real_cost_propagate_trigger
AFTER UPDATE OF cost_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_after_product_real_cost_propagate();
