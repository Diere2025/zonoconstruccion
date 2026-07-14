-- Migration V57: Delivery Tracking and Automatic Stock Deductions
-- Run using run_sql.js

-- 1. Create delivery_postponements table
CREATE TABLE IF NOT EXISTS public.delivery_postponements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    original_date DATE NOT NULL,
    new_date DATE NOT NULL,
    reason_type TEXT NOT NULL CHECK (reason_type IN ('cliente', 'empresa')),
    motive TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_by_id UUID,
    created_by_name TEXT
);

-- Enable RLS on delivery_postponements
ALTER TABLE public.delivery_postponements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select postponements" ON public.delivery_postponements;
CREATE POLICY "Authenticated users can select postponements" ON public.delivery_postponements
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage postponements" ON public.delivery_postponements;
CREATE POLICY "Authenticated users can manage postponements" ON public.delivery_postponements
    FOR ALL USING (auth.role() = 'authenticated');


-- 2. Modify update_product_stock_levels trigger function to support DELETE operations
CREATE OR REPLACE FUNCTION public.update_product_stock_levels()
RETURNS TRIGGER AS $$
DECLARE
  v_is_discontinued BOOLEAN;
  v_stock_current NUMERIC;
  v_transaction RECORD;
  v_quantity NUMERIC;
BEGIN
  -- Determine if it is INSERT or DELETE operation
  IF TG_OP = 'DELETE' THEN
    v_transaction := OLD;
  ELSE
    v_transaction := NEW;
  END IF;

  -- Obtener info del producto
  SELECT is_discontinued, stock_current INTO v_is_discontinued, v_stock_current
  FROM public.products
  WHERE id = v_transaction.product_id;

  -- Validar si está descontinuado y el stock quedaría en negativo (solo en INSERT)
  IF TG_OP = 'INSERT' AND v_is_discontinued AND (v_stock_current + v_transaction.quantity) < 0 AND v_transaction.type IN ('Reserva Pedido', 'Ajuste', 'Produccion Consumo') THEN
    RAISE EXCEPTION 'No hay suficiente stock disponible para el producto descontinuado.';
  END IF;

  -- Para DELETE, invertimos el signo de la cantidad a aplicar
  IF TG_OP = 'DELETE' THEN
    v_quantity := -v_transaction.quantity;
  ELSE
    v_quantity := v_transaction.quantity;
  END IF;

  -- Actualizar niveles en base al tipo de movimiento
  IF v_transaction.type = 'Ajuste' OR v_transaction.type = 'Compra' OR v_transaction.type = 'Produccion Ingreso' THEN
    UPDATE public.products
    SET 
      stock_physical = stock_physical + v_quantity,
      stock_current = stock_current + v_quantity
    WHERE id = v_transaction.product_id;

  ELSIF v_transaction.type = 'Reserva Pedido' THEN
    UPDATE public.products
    SET 
      stock_reserved = stock_reserved + v_quantity,
      stock_current = stock_current - v_quantity
    WHERE id = v_transaction.product_id;

  ELSIF v_transaction.type = 'Cancelacion Pedido' THEN
    UPDATE public.products
    SET 
      stock_reserved = stock_reserved - v_quantity,
      stock_current = stock_current + v_quantity
    WHERE id = v_transaction.product_id;

  ELSIF v_transaction.type = 'Entrega' THEN
    -- Al entregar, se reduce el stock físico y se libera la reserva. El stock_current no cambia.
    UPDATE public.products
    SET 
      stock_physical = stock_physical - v_quantity,
      stock_reserved = stock_reserved - v_quantity
    WHERE id = v_transaction.product_id;

  ELSIF v_transaction.type = 'Produccion Consumo' THEN
    -- Al consumir materia prima, se reduce el stock físico y el stock actual
    UPDATE public.products
    SET 
      stock_physical = stock_physical - v_quantity,
      stock_current = stock_current - v_quantity
    WHERE id = v_transaction.product_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger trg_inventory_transaction_inserted to run ON INSERT OR DELETE
DROP TRIGGER IF EXISTS trg_inventory_transaction_inserted ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transaction_inserted
AFTER INSERT OR DELETE ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_product_stock_levels();


-- 3. Create orders trigger to sync stock deductions ('Entrega') when order becomes 'Entregado'
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

  -- If status changed to 'Entregado'
  IF NEW.status = 'Entregado' AND (OLD.status IS NULL OR OLD.status <> 'Entregado') THEN
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

  -- If status changed FROM 'Entregado' to something else
  ELSIF OLD.status = 'Entregado' AND NEW.status <> 'Entregado' THEN
    DELETE FROM public.inventory_transactions 
    WHERE reference_id = NEW.id AND type = 'Entrega';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind trigger_sync_order_delivered_stock to orders table
DROP TRIGGER IF EXISTS trg_sync_order_delivered_stock ON public.orders;
CREATE TRIGGER trg_sync_order_delivered_stock
AFTER UPDATE OF status OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_delivered_stock();
