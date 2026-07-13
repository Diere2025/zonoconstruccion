-- Migration V52: Módulo de Recetas (BOM), Costos de Fabricación y Producción
-- Ejecutar en el SQL Editor de Supabase o usando run_sql.js

-- 1. Modificar tabla de productos
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS production_type TEXT DEFAULT 'comprado' CHECK (production_type IN ('comprado', 'fabricado', 'ensamblado')),
ADD COLUMN IF NOT EXISTS is_insumo BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS insumo_use TEXT CHECK (insumo_use IN ('fabricacion', 'ensamblado', 'ensamblado_venta')),
ADD COLUMN IF NOT EXISTS labor_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS overhead_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

-- 2. Actualizar tipos de transacciones de inventario
ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_type_check;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_type_check 
CHECK (type IN ('Ajuste', 'Compra', 'Reserva Pedido', 'Cancelacion Pedido', 'Entrega', 'Produccion Ingreso', 'Produccion Consumo'));

-- 3. Modificar la función trigger de stock para soportar los nuevos movimientos
CREATE OR REPLACE FUNCTION public.update_product_stock_levels()
RETURNS TRIGGER AS $$
DECLARE
  v_is_discontinued BOOLEAN;
  v_stock_current NUMERIC;
BEGIN
  -- Obtener info del producto
  SELECT is_discontinued, stock_current INTO v_is_discontinued, v_stock_current
  FROM public.products
  WHERE id = NEW.product_id;

  -- Validar si está descontinuado y el stock quedaría en negativo
  IF v_is_discontinued AND (v_stock_current + NEW.quantity) < 0 AND NEW.type IN ('Reserva Pedido', 'Ajuste', 'Produccion Consumo') THEN
    RAISE EXCEPTION 'No hay suficiente stock disponible para el producto descontinuado.';
  END IF;

  -- Actualizar niveles en base al tipo de movimiento
  IF NEW.type = 'Ajuste' OR NEW.type = 'Compra' OR NEW.type = 'Produccion Ingreso' THEN
    UPDATE public.products
    SET 
      stock_physical = stock_physical + NEW.quantity,
      stock_current = stock_current + NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Reserva Pedido' THEN
    UPDATE public.products
    SET 
      stock_reserved = stock_reserved + NEW.quantity,
      stock_current = stock_current - NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Cancelacion Pedido' THEN
    UPDATE public.products
    SET 
      stock_reserved = stock_reserved - NEW.quantity,
      stock_current = stock_current + NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Entrega' THEN
    -- Al entregar, se reduce el stock físico y se libera la reserva. El stock_current no cambia.
    UPDATE public.products
    SET 
      stock_physical = stock_physical - NEW.quantity,
      stock_reserved = stock_reserved - NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Produccion Consumo' THEN
    -- Al consumir materia prima, se reduce el stock físico y el stock actual
    UPDATE public.products
    SET 
      stock_physical = stock_physical - NEW.quantity,
      stock_current = stock_current - NEW.quantity
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear tabla de Recetas (BOM)
CREATE TABLE IF NOT EXISTS public.product_boms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    waste_percentage NUMERIC DEFAULT 0 CHECK (waste_percentage >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(parent_product_id, component_product_id)
);

-- 5. Crear tablas de órdenes de producción
CREATE TABLE IF NOT EXISTS public.production_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    production_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    type TEXT NOT NULL CHECK (type IN ('fabricacion', 'ensamblado')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.production_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_log_id UUID NOT NULL REFERENCES public.production_logs(id) ON DELETE CASCADE,
    component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity_consumed NUMERIC NOT NULL CHECK (quantity_consumed > 0),
    unit_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Habilitar RLS
ALTER TABLE public.product_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_consumptions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Admins can manage product boms" ON public.product_boms;
CREATE POLICY "Admins can manage product boms" ON public.product_boms 
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view product boms" ON public.product_boms;
CREATE POLICY "Authenticated users can view product boms" ON public.product_boms 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage production logs" ON public.production_logs;
CREATE POLICY "Admins can manage production logs" ON public.production_logs 
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view production logs" ON public.production_logs;
CREATE POLICY "Authenticated users can view production logs" ON public.production_logs 
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage production consumptions" ON public.production_consumptions;
CREATE POLICY "Admins can manage production consumptions" ON public.production_consumptions 
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can view production consumptions" ON public.production_consumptions;
CREATE POLICY "Authenticated users can view production consumptions" ON public.production_consumptions 
    FOR SELECT USING (auth.role() = 'authenticated');


-- 7. Funciones de cálculo automático de costos
CREATE OR REPLACE FUNCTION public.calculate_product_cost(p_product_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_prod_type TEXT;
  v_labor NUMERIC;
  v_overhead NUMERIC;
  v_cost NUMERIC := 0;
  v_comp RECORD;
  v_comp_cost NUMERIC;
BEGIN
  -- Obtener info del producto
  SELECT production_type, COALESCE(labor_cost, 0), COALESCE(overhead_cost, 0), COALESCE(cost_price, 0)
  INTO v_prod_type, v_labor, v_overhead, v_cost
  FROM public.products
  WHERE id = p_product_id;

  -- Si es comprado, retorna su costo base actual
  IF v_prod_type = 'comprado' THEN
    RETURN v_cost;
  END IF;

  -- Si es fabricado/ensamblado, calcula sumando componentes del BOM
  v_cost := 0;
  FOR v_comp IN 
    SELECT component_product_id, quantity, waste_percentage 
    FROM public.product_boms 
    WHERE parent_product_id = p_product_id
  LOOP
    -- Llamar recursivamente para obtener costo del componente
    v_comp_cost := public.calculate_product_cost(v_comp.component_product_id);
    -- Sumar costo del componente ajustado por desperdicio
    v_cost := v_cost + (v_comp_cost * v_comp.quantity * (1 + COALESCE(v_comp.waste_percentage, 0) / 100));
  END LOOP;

  -- Sumar mano de obra y costos de fabricación
  v_cost := v_cost + v_labor + v_overhead;

  RETURN v_cost;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.recalculate_and_update_product_cost(p_product_id UUID)
RETURNS void AS $$
DECLARE
  v_calculated_cost NUMERIC;
  v_parent_id UUID;
BEGIN
  -- Calcular costo recursivo
  v_calculated_cost := public.calculate_product_cost(p_product_id);
  
  -- Actualizar el costo del producto (evitando gatillar recursión infinita)
  UPDATE public.products
  SET cost_price = v_calculated_cost
  WHERE id = p_product_id;

  -- Propagar a todos los productos padres
  FOR v_parent_id IN 
    SELECT DISTINCT parent_product_id 
    FROM public.product_boms 
    WHERE component_product_id = p_product_id
  LOOP
    PERFORM public.recalculate_and_update_product_cost(v_parent_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- 8. Triggers para automatizar el recálculo
-- Trigger para cuando cambia el BOM
CREATE OR REPLACE FUNCTION public.trg_bom_changes_recalculate_cost()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_and_update_product_cost(NEW.parent_product_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_and_update_product_cost(OLD.parent_product_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bom_changes ON public.product_boms;
CREATE TRIGGER trg_bom_changes
AFTER INSERT OR UPDATE OR DELETE ON public.product_boms
FOR EACH ROW EXECUTE FUNCTION public.trg_bom_changes_recalculate_cost();


-- Trigger para cuando cambian costos directos o el costo de un producto comprado
CREATE OR REPLACE FUNCTION public.trg_product_cost_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id UUID;
BEGIN
  -- Solo propagar si:
  -- A) Es un producto comprado y cambia su costo
  -- B) Es un producto fabricado/ensamblado y cambia su mano de obra o gastos indirectos
  IF (OLD.production_type = 'comprado' AND NEW.production_type = 'comprado' AND OLD.cost_price IS DISTINCT FROM NEW.cost_price) OR
     (NEW.production_type IN ('fabricado', 'ensamblado') AND (OLD.labor_cost IS DISTINCT FROM NEW.labor_cost OR OLD.overhead_cost IS DISTINCT FROM NEW.overhead_cost)) THEN
    
    -- Propagar costo a todos los padres que contengan este componente
    FOR v_parent_id IN 
      SELECT DISTINCT parent_product_id 
      FROM public.product_boms 
      WHERE component_product_id = NEW.id
    LOOP
      PERFORM public.recalculate_and_update_product_cost(v_parent_id);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_cost_changes_trigger ON public.products;
CREATE TRIGGER trg_product_cost_changes_trigger
AFTER UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_product_cost_changes();
