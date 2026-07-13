-- Migration v50: Automatic payment trigger to sync paid/seniado orders to client_payments
-- Execute using run_sql.js

CREATE OR REPLACE FUNCTION public.sync_order_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_deposit_amount NUMERIC;
  v_payment_method_id UUID;
  v_user_id UUID;
  v_existing_paid NUMERIC;
  v_target_amount NUMERIC;
BEGIN
  -- We only act if the order has a client_id and is not cancelled/annulled
  IF NEW.client_id IS NULL OR NEW.status IN ('Anulado', 'Cancelado') THEN
    IF NEW.status IN ('Anulado', 'Cancelado') THEN
      DELETE FROM public.client_payments 
      WHERE order_id = NEW.id AND notes = 'Sincronización automática de pago';
    END IF;
    RETURN NEW;
  END IF;

  -- Get the target payment amount based on payment_status
  IF NEW.payment_status = 'Abonado' THEN
    v_target_amount := NEW.total_amount;
  ELSIF NEW.payment_status = 'Seniado' THEN
    -- Get deposit_amount from totals jsonb
    IF NEW.totals IS NOT NULL AND NEW.totals ? 'deposit_amount' THEN
      v_target_amount := (NEW.totals->>'deposit_amount')::NUMERIC;
    ELSE
      v_target_amount := 0;
    END IF;
  ELSE
    v_target_amount := 0;
  END IF;

  -- Default payment method (Efectivo/Transferencia)
  v_payment_method_id := COALESCE(NEW.payment_method_id, 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3'::uuid);
  v_user_id := COALESCE(NEW.seller_id, '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid);

  -- Check the sum of existing payments for this order
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_paid
  FROM public.client_payments
  WHERE order_id = NEW.id AND status = 'Aprobado';

  -- If we need to adjust payments to match the target amount
  IF v_target_amount > 0 AND v_existing_paid < v_target_amount THEN
    -- Insert a payment for the difference
    INSERT INTO public.client_payments (
      client_id, 
      order_id, 
      amount, 
      currency, 
      exchange_rate, 
      payment_method_id, 
      status, 
      notes, 
      created_by,
      created_at
    ) VALUES (
      NEW.client_id,
      NEW.id,
      v_target_amount - v_existing_paid,
      'ARS',
      1,
      v_payment_method_id,
      'Aprobado',
      'Sincronización automática de pago',
      v_user_id,
      COALESCE(NEW.created_at, now())
    );
  ELSIF v_target_amount = 0 AND v_existing_paid > 0 THEN
    -- If the order is now 'Pendiente' but has automatic payments, remove them
    DELETE FROM public.client_payments 
    WHERE order_id = NEW.id AND notes = 'Sincronización automática de pago';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_order_payment_to_ledger ON public.orders;

CREATE TRIGGER trg_sync_order_payment_to_ledger
AFTER INSERT OR UPDATE OF payment_status, total_amount, status, totals ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_to_ledger();
