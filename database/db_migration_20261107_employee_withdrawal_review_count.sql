BEGIN;

CREATE OR REPLACE FUNCTION public.employee_withdrawal_review_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM public.employee_withdrawal_access a
    JOIN public.sellers s ON s.id = a.user_id
    WHERE a.user_id = auth.uid() AND a.can_review AND s.is_active
  ) THEN (
    SELECT count(*)::integer FROM public.employee_withdrawals WHERE state = 'pending'
  ) END;
$$;

REVOKE ALL ON FUNCTION public.employee_withdrawal_review_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_review_count() TO authenticated;

COMMIT;
