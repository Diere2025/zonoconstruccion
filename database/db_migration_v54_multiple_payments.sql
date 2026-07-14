-- Migration v54: Multiple payments support in sync_order_payment_to_ledger
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
      WHERE order_id = NEW.id AND (notes = 'Sincronización automática de pago' OR notes LIKE 'Pago desglosado%');
    END IF;
    RETURN NEW;
  END IF;

  v_user_id := COALESCE(NEW.seller_id, '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid);

  -- 1. Check if we have multiple payments breakdown in totals JSONB
  IF NEW.totals IS NOT NULL AND NEW.totals ? 'payments_breakdown' AND jsonb_typeof(NEW.totals->'payments_breakdown') = 'array' THEN
    -- Delete existing automatic payments and breakdown payments to avoid duplication
    DELETE FROM public.client_payments 
    WHERE order_id = NEW.id AND (notes = 'Sincronización automática de pago' OR notes LIKE 'Pago desglosado%');

    -- Insert all payments defined in the breakdown
    INSERT INTO public.client_payments (
      client_id, 
      order_id, 
      amount, 
      currency, 
      exchange_rate, 
      payment_method_id, 
      status, 
      notes, 
      receipt_url,
      created_by,
      created_at
    )
    SELECT 
      NEW.client_id,
      NEW.id,
      COALESCE((elem->>'total_amount')::NUMERIC, (elem->>'amount')::NUMERIC),
      COALESCE(elem->>'currency', 'ARS'),
      COALESCE((elem->>'exchange_rate')::NUMERIC, 1.0),
      (elem->>'payment_method_id')::UUID,
      'Aprobado',
      COALESCE(elem->>'notes', 'Pago desglosado'),
      elem->>'receipt_url',
      v_user_id,
      COALESCE((elem->>'created_at')::TIMESTAMP WITH TIME ZONE, now())
    FROM jsonb_array_elements(NEW.totals->'payments_breakdown') AS elem
    WHERE COALESCE((elem->>'total_amount')::NUMERIC, (elem->>'amount')::NUMERIC) > 0;

  ELSE
    -- 2. Fallback to existing single payment logic
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
