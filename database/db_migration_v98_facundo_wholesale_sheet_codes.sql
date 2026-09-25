-- Facundo comparte la secuencia AQ-FP de su planilla entre pedidos B2C y B2B.
-- El worker asigna el código definitivo al sincronizar las tres planillas.
CREATE OR REPLACE FUNCTION public.assign_wholesale_order_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.channel = 'mayorista'
    AND NEW.seller_id IS DISTINCT FROM '3820a0fe-bb0a-4a84-ad85-79e49868cad7'::uuid
    AND NULLIF(trim(NEW.legacy_code), '') IS NULL THEN
    NEW.legacy_code := 'MY' || lpad(nextval('public.wholesale_order_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
