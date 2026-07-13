-- Migration V56: Soporte para Multidivisa en Listas de Precios y Tipo de Cambio USD
-- Ejecutar en Supabase o usando run_sql.js

-- 1. Agregar columna de moneda a la tabla price_lists si no existe
ALTER TABLE public.price_lists ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'ARS';

-- 2. Insertar tipo de cambio inicial en site_settings
INSERT INTO public.site_settings (id, value, created_at, updated_at)
VALUES ('usd_exchange_rate', '1465', now(), now())
ON CONFLICT (id) DO UPDATE SET value = '1465', updated_at = now();

-- 3. Crear o reemplazar la función para sincronizar costos de productos en ARS
CREATE OR REPLACE FUNCTION public.sync_product_costs_from_active_price_lists(p_product_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_usd_rate NUMERIC;
  v_rec RECORD;
BEGIN
  -- Obtener el tipo de cambio de site_settings
  SELECT COALESCE(value::NUMERIC, 1.0) INTO v_usd_rate
  FROM public.site_settings
  WHERE id = 'usd_exchange_rate';
  
  IF v_usd_rate IS NULL OR v_usd_rate <= 0 THEN
    v_usd_rate := 1.0;
  END IF;

  -- Recorrer productos comprados que tienen un proveedor primario y lista de precios activa
  FOR v_rec IN
    SELECT 
      p.id,
      p.sku,
      pli.final_cost,
      pl.currency,
      COALESCE(s.base_discount_percentage, 0) as supplier_discount
    FROM public.products p
    JOIN public.product_supplier_relations psr ON psr.product_id = p.id AND psr.is_primary = true
    JOIN public.price_lists pl ON pl.supplier_id = psr.supplier_id AND pl.is_active = true
    JOIN public.price_list_items pli ON pli.price_list_id = pl.id AND pli.sku = p.sku
    JOIN public.suppliers s ON s.id = psr.supplier_id
    WHERE p.production_type = 'comprado'
      AND (p_product_id IS NULL OR p.id = p_product_id)
  LOOP
    DECLARE
      v_new_cost NUMERIC;
    BEGIN
      -- Costo final de lista con descuento del proveedor
      v_new_cost := v_rec.final_cost * (1 - v_rec.supplier_discount / 100.0);
      
      -- Convertir a pesos si la lista está en USD
      IF COALESCE(v_rec.currency, 'ARS') = 'USD' THEN
        v_new_cost := v_new_cost * v_usd_rate;
      END IF;
      
      -- Redondear a 2 decimales
      v_new_cost := ROUND(v_new_cost, 2);
      
      -- Actualizar cost_price en el producto (esto disparará el recálculo en cascada para productos fabricados)
      UPDATE public.products
      SET cost_price = v_new_cost
      WHERE id = v_rec.id AND cost_price IS DISTINCT FROM v_new_cost;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Triggers para automatizar la sincronización y propagación de costos

-- A) Trigger para cambios en el tipo de cambio del dólar
CREATE OR REPLACE FUNCTION public.trg_site_settings_usd_rate_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id = 'usd_exchange_rate' AND (OLD.value IS DISTINCT FROM NEW.value) THEN
    PERFORM public.sync_product_costs_from_active_price_lists();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_settings_usd_rate_change_trigger ON public.site_settings;
CREATE TRIGGER trg_site_settings_usd_rate_change_trigger
AFTER UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.trg_site_settings_usd_rate_change();

-- B) Trigger para cuando se activa o cambia una lista de precios
CREATE OR REPLACE FUNCTION public.trg_price_lists_active_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL)) OR
      (NEW.currency IS DISTINCT FROM OLD.currency) THEN
    PERFORM public.sync_product_costs_from_active_price_lists();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_lists_active_change_trigger ON public.price_lists;
CREATE TRIGGER trg_price_lists_active_change_trigger
AFTER INSERT OR UPDATE ON public.price_lists
FOR EACH ROW EXECUTE FUNCTION public.trg_price_lists_active_change();

-- C) Trigger para cuando cambian ítems específicos en una lista de precios activa
CREATE OR REPLACE FUNCTION public.trg_price_list_items_change()
RETURNS TRIGGER AS $$
DECLARE
  v_prod_id UUID;
  v_sku TEXT;
BEGIN
  v_sku := COALESCE(NEW.sku, OLD.sku);
  FOR v_prod_id IN
    SELECT id FROM public.products WHERE sku = v_sku
  LOOP
    PERFORM public.sync_product_costs_from_active_price_lists(v_prod_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_list_items_change_trigger ON public.price_list_items;
CREATE TRIGGER trg_price_list_items_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.price_list_items
FOR EACH ROW EXECUTE FUNCTION public.trg_price_list_items_change();

-- D) Trigger para cuando cambia el proveedor primario de un producto
CREATE OR REPLACE FUNCTION public.trg_product_supplier_relations_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_product_costs_from_active_price_lists(OLD.product_id);
  ELSE
    PERFORM public.sync_product_costs_from_active_price_lists(NEW.product_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_supplier_relations_change_trigger ON public.product_supplier_relations;
CREATE TRIGGER trg_product_supplier_relations_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.product_supplier_relations
FOR EACH ROW EXECUTE FUNCTION public.trg_product_supplier_relations_change();

-- 5. Ejecutar la sincronización inicial de costos
SELECT public.sync_product_costs_from_active_price_lists();
