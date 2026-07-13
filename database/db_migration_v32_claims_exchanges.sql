-- Migration v32: Reclamos y Cambios DB Triggers Optimization
-- Protects inventory transactions from being inserted on pending returns/exchanges
-- Executes inventory transactions atomically when a return/exchange is marked as 'Completado'

-- 1. Redefine process_return_item_inventory
CREATE OR REPLACE FUNCTION public.process_return_item_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
BEGIN
  SELECT created_by, status INTO v_user_id, v_status
    FROM public.returns_exchanges 
    WHERE id = NEW.return_id;

  -- Only record inventory transactions automatically if the operation is already completed/approved
  IF v_status = 'Completado' AND NEW.restock_action = 'reingreso_stock' THEN
    INSERT INTO public.inventory_transactions (
      product_id,
      quantity,
      type,
      reference_id,
      user_id
    ) VALUES (
      NEW.product_id,
      NEW.quantity,
      'Ajuste',
      NEW.return_id,
      v_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Redefine process_exchange_item_inventory
CREATE OR REPLACE FUNCTION public.process_exchange_item_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
BEGIN
  SELECT created_by, status INTO v_user_id, v_status
    FROM public.returns_exchanges 
    WHERE id = NEW.return_id;

  -- Only record inventory transactions automatically if the operation is already completed/approved
  IF v_status = 'Completado' THEN
    INSERT INTO public.inventory_transactions (
      product_id,
      quantity,
      type,
      reference_id,
      user_id
    ) VALUES (
      NEW.product_id,
      -NEW.quantity,
      'Ajuste',
      NEW.return_id,
      v_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create process_returns_exchanges_status_completed function
CREATE OR REPLACE FUNCTION public.process_returns_exchanges_status_completed()
RETURNS TRIGGER AS $$
DECLARE
  r_item RECORD;
  e_item RECORD;
BEGIN
  -- Trigger inventory transactions when status moves to 'Completado'
  IF NEW.status = 'Completado' AND (OLD.status IS NULL OR OLD.status != 'Completado') THEN
    
    -- Loop return items and restock if action is 'reingreso_stock'
    FOR r_item IN 
      SELECT product_id, quantity, restock_action 
      FROM public.return_items 
      WHERE return_id = NEW.id
    LOOP
      IF r_item.restock_action = 'reingreso_stock' THEN
        INSERT INTO public.inventory_transactions (
          product_id,
          quantity,
          type,
          reference_id,
          user_id
        ) VALUES (
          r_item.product_id,
          r_item.quantity,
          'Ajuste',
          NEW.id,
          NEW.created_by
        );
      END IF;
    END LOOP;

    -- Loop exchange items and deduct stock
    FOR e_item IN 
      SELECT product_id, quantity 
      FROM public.exchange_items 
      WHERE return_id = NEW.id
    LOOP
      INSERT INTO public.inventory_transactions (
        product_id,
        quantity,
        type,
        reference_id,
        user_id
      ) VALUES (
        e_item.product_id,
        -e_item.quantity,
        'Ajuste',
        NEW.id,
        NEW.created_by
      );
    END LOOP;

  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger on returns_exchanges updates
DROP TRIGGER IF EXISTS trg_returns_exchanges_completed ON public.returns_exchanges;
CREATE TRIGGER trg_returns_exchanges_completed
AFTER UPDATE ON public.returns_exchanges
FOR EACH ROW
EXECUTE FUNCTION public.process_returns_exchanges_status_completed();
