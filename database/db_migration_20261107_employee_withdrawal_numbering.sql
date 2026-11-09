BEGIN;

LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS public.employee_withdrawal_number_seq AS bigint START WITH 155;
REVOKE ALL ON SEQUENCE public.employee_withdrawal_number_seq FROM PUBLIC, anon, authenticated;

-- RMRH00154 is the last code loaded manually in the historical workbook.
SELECT setval('public.employee_withdrawal_number_seq', greatest(
  155,
  (SELECT last_value + is_called::integer FROM public.employee_withdrawal_number_seq),
  (SELECT coalesce(max(substring(legacy_code FROM 5)::bigint) + 1, 155)
   FROM public.orders WHERE legacy_code ~ '^RMRH[0-9]{5,12}$')
), false);

CREATE UNIQUE INDEX IF NOT EXISTS orders_employee_withdrawal_rmrh_code_unique ON public.orders(legacy_code)
WHERE employee_withdrawal AND legacy_code ~ '^RMRH[0-9]+$';

CREATE OR REPLACE FUNCTION public.assign_employee_withdrawal_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE number_text text := nextval('public.employee_withdrawal_number_seq')::text;
BEGIN
  NEW.legacy_code := 'RMRH' || lpad(number_text, greatest(5, length(number_text)), '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_employee_withdrawal_code ON public.orders;
CREATE TRIGGER assign_employee_withdrawal_code
BEFORE INSERT ON public.orders FOR EACH ROW
WHEN (NEW.employee_withdrawal AND (NEW.legacy_code IS NULL OR NEW.legacy_code LIKE 'RE-%'))
EXECUTE FUNCTION public.assign_employee_withdrawal_code();

COMMIT;
