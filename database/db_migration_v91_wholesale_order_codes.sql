-- Los nuevos pedidos mayoristas reciben un código del ERP sin consultar planillas.
CREATE SEQUENCE IF NOT EXISTS public.wholesale_order_code_seq;

CREATE OR REPLACE FUNCTION public.assign_wholesale_order_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.channel = 'mayorista' AND NULLIF(trim(NEW.legacy_code), '') IS NULL THEN
    NEW.legacy_code := 'MY' || lpad(nextval('public.wholesale_order_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assign_wholesale_order_code ON public.orders;
CREATE TRIGGER assign_wholesale_order_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_wholesale_order_code();
