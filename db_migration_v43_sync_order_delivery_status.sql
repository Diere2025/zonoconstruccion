-- Migration V43: Automatically sync delivery status when order status changes
-- Prevents delivered/canceled orders from remaining "Pending routing"

-- 1. Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.on_order_status_updated_sync_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'Entregado' THEN
      UPDATE public.deliveries
      SET status = 'entregado', delivery_date = COALESCE(delivery_date, NOW())
      WHERE order_id = NEW.id AND status != 'entregado';
    ELSIF NEW.status = 'Cancelado' THEN
      UPDATE public.deliveries
      SET status = 'fallido'
      WHERE order_id = NEW.id AND status != 'fallido';
    ELSIF NEW.status IN ('Pendiente', 'Confirmado', 'Entregando') THEN
      UPDATE public.deliveries
      SET status = 'pendiente_ruteo'
      WHERE order_id = NEW.id AND status IN ('entregado', 'fallido');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Bind the trigger function to orders AFTER UPDATE
DROP TRIGGER IF EXISTS trigger_on_order_status_updated_sync_delivery ON public.orders;

CREATE TRIGGER trigger_on_order_status_updated_sync_delivery
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_status_updated_sync_delivery();

-- 3. Align existing records immediately
-- Fix delivered orders whose deliveries are still pending
UPDATE public.deliveries d
SET status = 'entregado', delivery_date = COALESCE(d.delivery_date, NOW())
FROM public.orders o
WHERE d.order_id = o.id
  AND o.status = 'Entregado'
  AND d.status != 'entregado';

-- Fix canceled orders whose deliveries are not failed
UPDATE public.deliveries d
SET status = 'fallido'
FROM public.orders o
WHERE d.order_id = o.id
  AND o.status = 'Cancelado'
  AND d.status != 'fallido';
