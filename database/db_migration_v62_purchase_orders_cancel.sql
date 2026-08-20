-- Migration V62: Purchase Order and Item Cancellation and Notes
-- Run using run_sql or directly in Supabase

-- 1. Agregar columna de notas a items de OC si no existe
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Actualizar función del trigger
CREATE OR REPLACE FUNCTION public.sync_purchase_order_quantities()
RETURNS TRIGGER AS $$
DECLARE
  v_po_item_id UUID;
  v_po_id UUID;
  v_received_sum NUMERIC(12, 3);
  v_ordered NUMERIC(12, 3);
  v_item_current_status VARCHAR(50);
  v_item_status VARCHAR(50);
  v_po_current_status VARCHAR(50);
  v_all_completed BOOLEAN;
  v_any_received BOOLEAN;
  v_rec RECORD;
BEGIN
  -- Determinar ID del item afectado
  IF TG_OP = 'DELETE' THEN
    v_po_item_id := OLD.purchase_order_item_id;
  ELSE
    v_po_item_id := NEW.purchase_order_item_id;
  END IF;

  IF v_po_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Obtener información actual de la base de datos
  SELECT purchase_order_id, quantity_ordered, status INTO v_po_id, v_ordered, v_item_current_status
  FROM public.purchase_order_items
  WHERE id = v_po_item_id;

  IF v_po_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT status INTO v_po_current_status
  FROM public.purchase_orders
  WHERE id = v_po_id;

  -- Regla 1: Si la OC completa o la línea ya está cancelada, no recalcular por cambios en recepciones
  IF v_item_current_status = 'Cancelado' OR v_po_current_status = 'Cancelado' THEN
    RETURN NULL;
  END IF;

  -- Calcular suma de cantidades recibidas
  SELECT COALESCE(SUM(quantity_received), 0) INTO v_received_sum
  FROM public.purchase_reception_items
  WHERE purchase_order_item_id = v_po_item_id;

  -- Determinar nuevo estado de la línea
  IF v_received_sum >= v_ordered THEN
    v_item_status := 'Cumplido';
  ELSIF v_received_sum > 0 THEN
    v_item_status := 'Parcial';
  ELSE
    v_item_status := 'Pendiente';
  END IF;

  -- Actualizar ítem
  UPDATE public.purchase_order_items
  SET quantity_received = v_received_sum,
      status = v_item_status
  WHERE id = v_po_item_id;

  -- Recalcular estado del pedido padre
  v_all_completed := TRUE;
  v_any_received := FALSE;

  FOR v_rec IN 
    SELECT quantity_ordered, quantity_received, status 
    FROM public.purchase_order_items 
    WHERE purchase_order_id = v_po_id
  LOOP
    IF v_rec.status <> 'Cumplido' AND v_rec.status <> 'Cancelado' THEN
      v_all_completed := FALSE;
    END IF;
    IF v_rec.quantity_received > 0 OR v_rec.status = 'Parcial' THEN
      v_any_received := TRUE;
    END IF;
  END LOOP;

  IF v_all_completed THEN
    UPDATE public.purchase_orders SET status = 'Cumplido' WHERE id = v_po_id;
  ELSIF v_any_received THEN
    UPDATE public.purchase_orders SET status = 'Parcial' WHERE id = v_po_id;
  ELSE
    UPDATE public.purchase_orders SET status = 'Pendiente' WHERE id = v_po_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
