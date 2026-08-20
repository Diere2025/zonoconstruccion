-- Migration V60: Purchase Orders, Goods Receptions, and Automated Stock Deductions
-- Run using run_sql.js

-- 1. Create Purchase Orders Table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oc_code VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    estimated_delivery_date TIMESTAMP WITH TIME ZONE,
    payment_condition VARCHAR(100),
    payment_term_days INT,
    notes TEXT,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Parcial', 'Cumplido', 'Cancelado')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 2. Create Purchase Order Items Table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    raw_product_name TEXT NOT NULL,
    quantity_ordered NUMERIC(12, 3) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost NUMERIC(15, 2) NOT NULL CHECK (unit_cost >= 0),
    subtotal NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Parcial', 'Cumplido', 'Cancelado')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Create Purchase Receptions Table
CREATE TABLE IF NOT EXISTS public.purchase_receptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reception_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    delivery_slip_number VARCHAR(100),
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 4. Create Purchase Reception Items Table
CREATE TABLE IF NOT EXISTS public.purchase_reception_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_reception_id UUID NOT NULL REFERENCES public.purchase_receptions(id) ON DELETE CASCADE,
    purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity_received NUMERIC(12, 3) NOT NULL CHECK (quantity_received > 0),
    unit_cost NUMERIC(15, 2) NOT NULL CHECK (unit_cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Enable RLS and Add Policies
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_reception_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users on purchase_orders" 
    ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for authenticated users on purchase_orders" 
    ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow read for authenticated users on purchase_order_items" 
    ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for authenticated users on purchase_order_items" 
    ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow read for authenticated users on purchase_receptions" 
    ON public.purchase_receptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for authenticated users on purchase_receptions" 
    ON public.purchase_receptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow read for authenticated users on purchase_reception_items" 
    ON public.purchase_reception_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write for authenticated users on purchase_reception_items" 
    ON public.purchase_reception_items FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 6. Trigger Function to sync stock upon goods reception
CREATE OR REPLACE FUNCTION public.sync_purchase_reception_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_created_by UUID;
BEGIN
  -- Insert/update/delete corresponding inventory transactions of type 'Compra'
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.inventory_transactions
    WHERE reference_id = OLD.purchase_reception_id 
      AND product_id = OLD.product_id
      AND type = 'Compra';
    RETURN OLD;
  END IF;

  -- Get user_id from parent reception
  SELECT created_by INTO v_created_by
  FROM public.purchase_receptions
  WHERE id = NEW.purchase_reception_id;

  -- Clean up old transactions first (useful for updates)
  DELETE FROM public.inventory_transactions
  WHERE reference_id = NEW.purchase_reception_id 
    AND product_id = NEW.product_id
    AND type = 'Compra';

  -- Insert new transaction
  INSERT INTO public.inventory_transactions (
    product_id,
    quantity,
    type,
    reference_id,
    user_id,
    created_at
  ) VALUES (
    NEW.product_id,
    NEW.quantity_received,
    'Compra',
    NEW.purchase_reception_id,
    v_created_by,
    NEW.created_at
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_purchase_reception_stock
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_reception_items
FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_reception_stock();


-- 7. Trigger Function to update Purchase Order and Item quantities & status
CREATE OR REPLACE FUNCTION public.sync_purchase_order_quantities()
RETURNS TRIGGER AS $$
DECLARE
  v_po_item_id UUID;
  v_po_id UUID;
  v_received_sum NUMERIC(12, 3);
  v_ordered NUMERIC(12, 3);
  v_item_status VARCHAR(50);
  v_all_completed BOOLEAN;
  v_any_received BOOLEAN;
  v_rec RECORD;
BEGIN
  -- Determine which purchase_order_item_id was affected
  IF TG_OP = 'DELETE' THEN
    v_po_item_id := OLD.purchase_order_item_id;
  ELSE
    v_po_item_id := NEW.purchase_order_item_id;
  END IF;

  IF v_po_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get parent purchase_order_id and quantity_ordered
  SELECT purchase_order_id, quantity_ordered INTO v_po_id, v_ordered
  FROM public.purchase_order_items
  WHERE id = v_po_item_id;

  IF v_po_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate new sum of received quantities for this line
  SELECT COALESCE(SUM(quantity_received), 0) INTO v_received_sum
  FROM public.purchase_reception_items
  WHERE purchase_order_item_id = v_po_item_id;

  -- Determine item line status
  IF v_received_sum >= v_ordered THEN
    v_item_status := 'Cumplido';
  ELSIF v_received_sum > 0 THEN
    v_item_status := 'Parcial';
  ELSE
    v_item_status := 'Pendiente';
  END IF;

  -- Update purchase_order_items row
  UPDATE public.purchase_order_items
  SET quantity_received = v_received_sum,
      status = v_item_status
  WHERE id = v_po_item_id;

  -- Recalculate parent order status
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

CREATE TRIGGER trg_sync_purchase_order_quantities
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_reception_items
FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_order_quantities();
