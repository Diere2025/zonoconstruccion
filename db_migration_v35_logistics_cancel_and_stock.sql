-- Migration to support logistics order annulment and seller update policy

-- 1. Create the RPC function to allow logistics operators to annul an order (pasa a En Revisión)
CREATE OR REPLACE FUNCTION public.logistics_annul_order(p_delivery_id UUID, p_notes TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- runs with privileges of the creator (bypass RLS)
AS $$
DECLARE
  v_order_id UUID;
  v_formatted_note TEXT;
BEGIN
  -- Format the note to prepend to order notes
  v_formatted_note := E'⚠️ [Logística Ruteo - Pasa a Revisión]: ' || p_notes;

  -- Update the delivery status to 'fallido' and store notes
  UPDATE public.deliveries
  SET 
    status = 'fallido',
    notes = COALESCE(notes || E'\n' || p_notes, p_notes),
    updated_at = NOW()
  WHERE id = p_delivery_id
  RETURNING order_id INTO v_order_id;

  -- If it's an order delivery, update the order status to 'En Revisión' and prepend to delivery_notes
  IF v_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET 
      status = 'En Revisión',
      delivery_notes = COALESCE(v_formatted_note || E'\n' || delivery_notes, v_formatted_note),
      updated_at = NOW()
    WHERE id = v_order_id;
  END IF;
END;
$$;

-- 2. Add RLS policy on public.orders to allow sellers to update their own orders
-- First drop policy if it exists to make it idempotent
DROP POLICY IF EXISTS "Sellers can update their own orders" ON public.orders;

CREATE POLICY "Sellers can update their own orders" ON public.orders
  FOR UPDATE
  USING (
    (seller_id = auth.uid()) OR is_admin()
  );
