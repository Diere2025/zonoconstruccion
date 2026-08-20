-- Migration V63: Recalculate Purchase Order status on item status/quantity change
-- Run using run_sql or directly in Supabase

-- 1. Create a helper function to recalculate and update a PO's status
CREATE OR REPLACE FUNCTION public.recalculate_purchase_order_status(v_po_id UUID)
RETURNS VOID AS $$
DECLARE
  v_po_current_status VARCHAR(50);
  v_all_completed BOOLEAN;
  v_any_received BOOLEAN;
  v_any_active BOOLEAN;
  v_rec RECORD;
BEGIN
  IF v_po_id IS NULL THEN
    RETURN;
  END IF;

  -- Get current status of the parent order
  SELECT status INTO v_po_current_status
  FROM public.purchase_orders
  WHERE id = v_po_id;

  -- If parent order is manually cancelled or annulled, do not automatically change its status
  IF v_po_current_status = 'Cancelado' OR v_po_current_status = 'Anulado' THEN
    RETURN;
  END IF;

  v_all_completed := TRUE;
  v_any_received := FALSE;
  v_any_active := FALSE;

  FOR v_rec IN 
    SELECT quantity_ordered, quantity_received, status 
    FROM public.purchase_order_items 
    WHERE purchase_order_id = v_po_id
  LOOP
    IF v_rec.status <> 'Cancelado' THEN
      v_any_active := TRUE;
    END IF;
    
    IF v_rec.status <> 'Cumplido' AND v_rec.status <> 'Cancelado' THEN
      v_all_completed := FALSE;
    END IF;
    
    IF v_rec.quantity_received > 0 OR v_rec.status = 'Parcial' THEN
      v_any_received := TRUE;
    END IF;
  END LOOP;

  -- Update parent status
  IF NOT v_any_active THEN
    UPDATE public.purchase_orders SET status = 'Cancelado' WHERE id = v_po_id;
  ELSIF v_all_completed THEN
    UPDATE public.purchase_orders SET status = 'Cumplido' WHERE id = v_po_id;
  ELSIF v_any_received THEN
    UPDATE public.purchase_orders SET status = 'Parcial' WHERE id = v_po_id;
  ELSE
    UPDATE public.purchase_orders SET status = 'Pendiente' WHERE id = v_po_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Update existing trigger function sync_purchase_order_quantities()
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
BEGIN
  -- Determine item ID affected
  IF TG_OP = 'DELETE' THEN
    v_po_item_id := OLD.purchase_order_item_id;
  ELSE
    v_po_item_id := NEW.purchase_order_item_id;
  END IF;

  IF v_po_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get current info from database
  SELECT purchase_order_id, quantity_ordered, status INTO v_po_id, v_ordered, v_item_current_status
  FROM public.purchase_order_items
  WHERE id = v_po_item_id;

  IF v_po_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT status INTO v_po_current_status
  FROM public.purchase_orders
  WHERE id = v_po_id;

  -- Rule: If PO or item is already cancelled, don't recalculate due to reception changes
  IF v_item_current_status = 'Cancelado' OR v_po_current_status = 'Cancelado' THEN
    RETURN NULL;
  END IF;

  -- Calculate sum of received quantities
  SELECT COALESCE(SUM(quantity_received), 0) INTO v_received_sum
  FROM public.purchase_reception_items
  WHERE purchase_order_item_id = v_po_item_id;

  -- Determine new status for the line item
  IF v_received_sum >= v_ordered THEN
    v_item_status := 'Cumplido';
  ELSIF v_received_sum > 0 THEN
    v_item_status := 'Parcial';
  ELSE
    v_item_status := 'Pendiente';
  END IF;

  -- Update item
  UPDATE public.purchase_order_items
  SET quantity_received = v_received_sum,
      status = v_item_status
  WHERE id = v_po_item_id;

  -- Recalculate parent order status
  PERFORM public.recalculate_purchase_order_status(v_po_id);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger function and trigger on purchase_order_items
CREATE OR REPLACE FUNCTION public.sync_purchase_order_status_on_item_change()
RETURNS TRIGGER AS $$
DECLARE
  v_po_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_po_id := OLD.purchase_order_id;
  ELSE
    v_po_id := NEW.purchase_order_id;
  END IF;

  IF v_po_id IS NOT NULL THEN
    PERFORM public.recalculate_purchase_order_status(v_po_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_purchase_order_status_on_item_change ON public.purchase_order_items;
CREATE TRIGGER trg_sync_purchase_order_status_on_item_change
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_order_status_on_item_change();

-- 4. One-time recalculation for all existing purchase orders
DO $$
DECLARE
  v_po RECORD;
BEGIN
  FOR v_po IN SELECT id FROM public.purchase_orders LOOP
    PERFORM public.recalculate_purchase_order_status(v_po.id);
  END LOOP;
END;
$$;
