-- Migration V55: Aplanamiento de Recetas (BOM) y Desactivación de Intermedios
-- Ejecutar en el SQL Editor de Supabase o usando run_sql.js

-- 1. Función para aplanar de forma recursiva todas las recetas (BOM)
CREATE OR REPLACE FUNCTION public.flatten_all_boms()
RETURNS VOID AS $$
DECLARE
  v_iterations INT := 0;
  v_replaced_rows INT;
BEGIN
  RAISE NOTICE '=== STARTING RECIPE FLATTENING PROCESS ===';

  -- Loop para reemplazar los componentes intermedios de forma iterativa.
  -- Cada iteración aplana un nivel de la jerarquía.
  LOOP
    v_iterations := v_iterations + 1;
    IF v_iterations > 10 THEN
      RAISE WARNING 'Maximum recursion depth of 10 reached. Possible circular dependency in BOMs!';
      EXIT;
    END IF;

    -- Paso A y B combinados en una consulta única con CTE modificadora de datos:
    -- 1. Selecciona los enlaces aplanables ("expanded")
    -- 2. Elimina los enlaces originales de la base de datos ("deleted")
    -- 3. Calcula las nuevas combinaciones sumando componentes y ajustando desperdicios ("replacements")
    -- 4. Inserta/upserta las nuevas relaciones directas en la base de datos
    WITH expanded AS (
      SELECT id, parent_product_id, component_product_id, quantity, waste_percentage
      FROM public.product_boms
      WHERE component_product_id IN (SELECT DISTINCT parent_product_id FROM public.product_boms)
    ),
    deleted AS (
      DELETE FROM public.product_boms
      WHERE id IN (SELECT id FROM expanded)
      RETURNING parent_product_id, component_product_id, quantity, waste_percentage
    ),
    replacements AS (
      SELECT 
        d.parent_product_id AS parent_id,
        b2.component_product_id AS sub_component_id,
        (d.quantity * b2.quantity) AS new_qty,
        COALESCE(
          ((1 + COALESCE(d.waste_percentage, 0)/100.0) * (1 + COALESCE(b2.waste_percentage, 0)/100.0) - 1) * 100.0,
          0
        ) AS new_waste
      FROM deleted d
      JOIN public.product_boms b2 ON d.component_product_id = b2.parent_product_id
    )
    INSERT INTO public.product_boms (parent_product_id, component_product_id, quantity, waste_percentage)
    SELECT parent_id, sub_component_id, SUM(new_qty), AVG(new_waste)
    FROM replacements
    GROUP BY parent_id, sub_component_id
    ON CONFLICT (parent_product_id, component_product_id) 
    DO UPDATE SET 
      quantity = public.product_boms.quantity + EXCLUDED.quantity,
      waste_percentage = COALESCE((public.product_boms.waste_percentage + EXCLUDED.waste_percentage)/2.0, 0);

    GET DIAGNOSTICS v_replaced_rows = ROW_COUNT;
    
    -- Si no se insertó/modificó ninguna fila en esta pasada, significa que todas las recetas están 100% aplanadas.
    IF v_replaced_rows = 0 THEN
      EXIT;
    END IF;

    RAISE NOTICE 'Iteration %: Flattened % intermediate BOM relationships.', v_iterations, v_replaced_rows;
  END LOOP;

  -- 2. Desactivar productos intermedios (semi-elaborados) que ya no son referenciados
  --    en ninguna receta de producto terminado y que no tienen precio de venta directo (ej. BICAPA 1000L, CUATRIC (XL) BEIGE 500L).
  --    Los marcamos como is_active = false para ocultarlos del ERP.
  UPDATE public.products
  SET is_active = false
  WHERE production_type = 'fabricado'
    AND COALESCE(price, 0) = 0
    AND id NOT IN (SELECT DISTINCT component_product_id FROM public.product_boms);

  -- 3. Forzar recalculación y propagación de costos para todos los productos de fabricación activos
  --    con sus nuevas recetas aplanadas.
  DECLARE
    v_mfg RECORD;
  BEGIN
    FOR v_mfg IN 
      SELECT id FROM public.products 
      WHERE production_type IN ('fabricado', 'ensamblado') AND is_active = true
    LOOP
      PERFORM public.recalculate_and_update_product_cost(v_mfg.id);
    END LOOP;
  END;

  RAISE NOTICE '=== RECIPE FLATTENING PROCESS COMPLETE ===';
END;
$$ LANGUAGE plpgsql;

-- Ejecutar el aplanamiento inicial sobre la base de datos
SELECT public.flatten_all_boms();
