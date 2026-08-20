-- Migration V58: Treat 'Entregando' and 'Entregado' similarly for stock deduction
-- Run using run_sql.js

CREATE OR REPLACE FUNCTION public.sync_order_delivered_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_delivery_date TIMESTAMP WITH TIME ZONE;
  v_order_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.id;
  ELSE
    v_order_id := NEW.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- If the order is deleted, clean up all its inventory transactions (reverting their stock changes)
    DELETE FROM public.inventory_transactions 
    WHERE reference_id = v_order_id;
    RETURN OLD;
  END IF;

  -- If status changed to 'Entregando' or 'Entregado'
  IF NEW.status IN ('Entregando', 'Entregado') THEN
    -- Get actual delivery date
    SELECT COALESCE(
      (delivery_date::text || ' 12:00:00')::timestamp with time zone,
      NEW.order_date,
      now()
    ) INTO v_delivery_date
    FROM public.deliveries
    WHERE order_id = NEW.id;

    IF v_delivery_date IS NULL THEN
      v_delivery_date := now();
    END IF;

    -- Clean up any existing 'Entrega' transactions to prevent duplicates
    DELETE FROM public.inventory_transactions 
    WHERE reference_id = NEW.id AND type = 'Entrega';

    -- Insert 'Entrega' for each order item
    FOR v_item IN 
      SELECT product_id, quantity 
      FROM public.order_items 
      WHERE order_id = NEW.id AND product_id IS NOT NULL
    LOOP
      INSERT INTO public.inventory_transactions (
        product_id,
        quantity,
        type,
        reference_id,
        user_id,
        created_at
      ) VALUES (
        v_item.product_id,
        v_item.quantity,
        'Entrega',
        NEW.id,
        NEW.seller_id,
        v_delivery_date
      );
    END LOOP;

  -- If status changed FROM ('Entregando', 'Entregado') to something else
  ELSIF (OLD.status IN ('Entregando', 'Entregado')) AND (NEW.status NOT IN ('Entregando', 'Entregado')) THEN
    DELETE FROM public.inventory_transactions 
    WHERE reference_id = NEW.id AND type = 'Entrega';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
