BEGIN;

CREATE TABLE public.employee_withdrawal_rejection_reads (
  user_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.employee_withdrawals(order_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, order_id)
);

ALTER TABLE public.employee_withdrawal_rejection_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_withdrawal_rejection_reads FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.employee_withdrawal_rejection_notices(p_seen uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  roles text[];
  logistics boolean;
BEGIN
  SELECT array_append(coalesce(s.roles, ARRAY[]::text[]), s.role) INTO roles
  FROM public.sellers s WHERE s.id = actor AND s.is_active;
  IF NOT coalesce(roles && ARRAY['seller','vendedor','logistica'], false) THEN
    RETURN NULL;
  END IF;
  logistics := roles && ARRAY['logistica'];

  IF p_seen IS NOT NULL THEN
    INSERT INTO public.employee_withdrawal_rejection_reads(user_id, order_id)
    SELECT actor, w.order_id
    FROM public.employee_withdrawals w
    WHERE w.order_id = p_seen AND w.state = 'rejected' AND (logistics OR w.created_by = actor)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN (
    SELECT count(*)::integer
    FROM public.employee_withdrawals w
    WHERE w.state = 'rejected' AND (logistics OR w.created_by = actor)
      AND NOT EXISTS (
        SELECT 1 FROM public.employee_withdrawal_rejection_reads seen
        WHERE seen.user_id = actor AND seen.order_id = w.order_id
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employee_withdrawal_rejection_notices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_rejection_notices(uuid) TO authenticated;

COMMIT;
