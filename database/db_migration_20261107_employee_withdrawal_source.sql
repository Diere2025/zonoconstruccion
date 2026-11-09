BEGIN;

INSERT INTO public.advertising_sources (name, is_active, channel)
VALUES ('Retiro de empleado', true, 'minorista')
ON CONFLICT (name) DO UPDATE SET is_active = true;

CREATE OR REPLACE FUNCTION public.set_employee_withdrawal_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT id INTO STRICT NEW.advertising_source_id
  FROM public.advertising_sources
  WHERE name = 'Retiro de empleado';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_employee_withdrawal_source ON public.orders;
CREATE TRIGGER set_employee_withdrawal_source
BEFORE INSERT OR UPDATE OF employee_withdrawal, advertising_source_id ON public.orders
FOR EACH ROW WHEN (NEW.employee_withdrawal)
EXECUTE FUNCTION public.set_employee_withdrawal_source();

SELECT set_config('zono.employee_withdrawal_write', 'on', true);
UPDATE public.orders o
SET advertising_source_id = s.id
FROM public.advertising_sources s
WHERE s.name = 'Retiro de empleado'
  AND o.employee_withdrawal
  AND o.status NOT IN ('Entregado', 'Cancelado')
  AND o.advertising_source_id IS DISTINCT FROM s.id;

COMMIT;
