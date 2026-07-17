-- Migration V64: Fix historical statuses for purchase order items and recalculate parent statuses
-- Run using run_sql or directly in Supabase

-- 1. Correct status for all purchase_order_items based on quantities, keeping 'Cancelado'
UPDATE public.purchase_order_items
SET status = CASE
  WHEN status = 'Cancelado' THEN 'Cancelado'
  WHEN quantity_received >= quantity_ordered THEN 'Cumplido'
  WHEN quantity_received > 0 THEN 'Parcial'
  ELSE 'Pendiente'
END;

-- 2. Recalculate parent order statuses for all purchase orders
DO $$
DECLARE
  v_po RECORD;
BEGIN
  FOR v_po IN SELECT id FROM public.purchase_orders LOOP
    PERFORM public.recalculate_purchase_order_status(v_po.id);
  END LOOP;
END;
$$;
