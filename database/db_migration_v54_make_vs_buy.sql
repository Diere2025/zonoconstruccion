-- Migration V54: Análisis de Costos Make vs Buy (Fabricar vs Comprar)
-- Ejecutar en el SQL Editor de Supabase o usando run_sql.js

-- 1. Función para calcular el costo simulado del BOM de cualquier producto (incluso si hoy es comprado)
CREATE OR REPLACE FUNCTION public.calculate_simulated_bom_cost(p_product_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_labor NUMERIC;
  v_overhead NUMERIC;
  v_cost NUMERIC := 0;
  v_comp RECORD;
  v_comp_cost NUMERIC;
  v_has_bom BOOLEAN := false;
BEGIN
  -- Obtener mano de obra y overhead del producto
  SELECT COALESCE(labor_cost, 0), COALESCE(overhead_cost, 0)
  INTO v_labor, v_overhead
  FROM public.products
  WHERE id = p_product_id;

  -- Calcular sumando componentes del BOM
  FOR v_comp IN 
    SELECT component_product_id, quantity, waste_percentage 
    FROM public.product_boms 
    WHERE parent_product_id = p_product_id
  LOOP
    v_has_bom := true;
    -- Obtener el costo del componente (recursivo)
    v_comp_cost := public.calculate_product_cost(v_comp.component_product_id);
    -- Sumar costo del componente ajustado por desperdicio
    v_cost := v_cost + (v_comp_cost * v_comp.quantity * (1 + COALESCE(v_comp.waste_percentage, 0) / 100));
  END LOOP;

  -- Si no tiene componentes en el BOM, retornar 0
  IF NOT v_has_bom THEN
    RETURN 0;
  END IF;

  RETURN v_cost + v_labor + v_overhead;
END;
$$ LANGUAGE plpgsql;


-- 2. Función trigger para recalculación automática cuando cambia el origen de producción
CREATE OR REPLACE FUNCTION public.trg_product_type_change_recalculate()
RETURNS TRIGGER AS $$
BEGIN
  -- Si cambia el tipo de producción de comprado a fabricado/ensamblado,
  -- forzar el recálculo de su propio costo y su propagación en cascada.
  IF OLD.production_type = 'comprado' AND NEW.production_type IN ('fabricado', 'ensamblado') THEN
    PERFORM public.recalculate_and_update_product_cost(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear el trigger en public.products
DROP TRIGGER IF EXISTS trg_product_type_change_recalculate_trigger ON public.products;
CREATE TRIGGER trg_product_type_change_recalculate_trigger
AFTER UPDATE OF production_type ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_product_type_change_recalculate();
