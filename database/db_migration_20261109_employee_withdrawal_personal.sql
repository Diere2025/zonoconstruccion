BEGIN;

-- Financial notes stay outside operational orders, audits and sheet snapshots.
CREATE TABLE public.employee_withdrawal_personal (
  order_id uuid PRIMARY KEY REFERENCES public.employee_withdrawals(order_id) ON DELETE CASCADE,
  amount numeric CHECK (amount BETWEEN 0 AND 9999999999 AND amount=round(amount,2)),
  payment_reference text CHECK (length(payment_reference)<=500)
);
ALTER TABLE public.employee_withdrawal_personal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_withdrawal_personal FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.employee_withdrawal_save(text,uuid,integer,jsonb) RENAME TO employee_withdrawal_save_standard;
REVOKE EXECUTE ON FUNCTION public.employee_withdrawal_save_standard(text,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.employee_withdrawal_save(p_action text, p_id uuid, p_version integer, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner_id constant uuid := '381df0d1-183f-4ccb-aaf2-8147c76159a9';
  personal boolean;
  wants_personal boolean := coalesce(p_data->>'beneficiary_type'='personal',false);
  capabilities jsonb;
  private_amount numeric;
  private_reference text;
  safe_data jsonb;
  current_version integer;
  old_flag text := coalesce(current_setting('zono.employee_withdrawal_write',true),'');
BEGIN
  IF p_action='access' THEN
    RETURN public.employee_withdrawal_save_standard(p_action,p_id,p_version,p_data);
  END IF;
  IF p_action IN ('create','edit','personal_details') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  END IF;
  SELECT EXISTS (SELECT FROM public.employee_withdrawal_personal WHERE order_id=p_id) INTO personal;
  IF NOT (personal OR wants_personal OR p_action='personal_details') THEN
    RETURN public.employee_withdrawal_save_standard(p_action,p_id,p_version,p_data);
  END IF;
  IF personal AND p_action IN ('deliver','refund','close_delivery','cancel') THEN
    RETURN public.employee_withdrawal_save_standard(p_action,p_id,p_version,p_data);
  END IF;
  capabilities := public.employee_withdrawal_capabilities();
  IF auth.uid() IS DISTINCT FROM owner_id OR NOT coalesce((capabilities->>'admin')::boolean,false) THEN
    RAISE EXCEPTION 'Solo Diego puede gestionar los datos de sus retiros personales.';
  END IF;
  IF p_action NOT IN ('create','edit','personal_details') THEN
    RAISE EXCEPTION 'Los retiros personales no pasan por revisión ni por nómina de RR. HH.';
  END IF;
  IF p_action='create' AND personal THEN RETURN p_id; END IF;
  IF (p_action='create' AND EXISTS (SELECT FROM public.orders WHERE id=p_id))
     OR (p_action IN ('edit','personal_details') AND NOT personal) THEN
    RAISE EXCEPTION 'El tipo de retiro no se puede cambiar.';
  END IF;
  private_amount := nullif(p_data->>'personal_amount','')::numeric;
  private_reference := nullif(trim(p_data->>'payment_reference'),'');
  IF (private_amount IS NOT NULL AND (private_amount NOT BETWEEN 0 AND 9999999999 OR private_amount<>round(private_amount,2)))
     OR length(private_reference)>500 THEN
    RAISE EXCEPTION 'Revisá el importe interno y la referencia de pago.';
  END IF;

  IF p_action IN ('create','edit') THEN
    safe_data := jsonb_build_object(
      'beneficiary_type','external',
      'external_name',coalesce(nullif(trim(p_data->>'external_name'),''),'Diego Bóveda'),
      'external_reference','Retiro a nombre de Diego Bóveda',
      'discount_rate',0,
      'note',p_data->>'note','category',p_data->>'category','mode',coalesce(p_data->>'mode','pickup'),
      'address',p_data->>'address','locality',p_data->>'locality','phone',p_data->>'phone',
      'delivery_date',p_data->>'delivery_date','deadline',coalesce(p_data->>'deadline',p_data->>'delivery_date'),
      'maps_link',p_data->>'maps_link',
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'product_id',item->>'product_id','quantity',item->>'quantity','price',0))
        FROM jsonb_array_elements(p_data->'items') AS item),'[]'::jsonb)
    );
    PERFORM public.employee_withdrawal_save_standard(p_action,p_id,p_version,safe_data);
    SELECT version INTO current_version FROM public.employee_withdrawals WHERE order_id=p_id;
    PERFORM public.employee_withdrawal_save_standard('approve',p_id,current_version,
      jsonb_build_object('note','Retiro personal de Diego Bóveda'));
    PERFORM set_config('zono.employee_withdrawal_write','on',true);
    UPDATE public.orders SET
      totals=totals || jsonb_build_object('withdrawal_beneficiary_type','personal'),
      delivery_notes=concat_ws(' · ','Retiro personal de Diego Bóveda','Sin cobro en la entrega',nullif(totals->>'employee_operational_note',''))
    WHERE id=p_id;
    PERFORM set_config('zono.employee_withdrawal_write',old_flag,true);
  END IF;

  INSERT INTO public.employee_withdrawal_personal(order_id,amount,payment_reference)
  VALUES(p_id,private_amount,private_reference)
  ON CONFLICT (order_id) DO UPDATE SET amount=excluded.amount,payment_reference=excluded.payment_reference;
  RETURN p_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.employee_withdrawal_save(text,uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_save(text,uuid,integer,jsonb) TO authenticated;

ALTER FUNCTION public.employee_withdrawal_read(date,text,integer) RENAME TO employee_withdrawal_read_standard;
REVOKE EXECUTE ON FUNCTION public.employee_withdrawal_read_standard(date,text,integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.employee_withdrawal_read(p_period date DEFAULT NULL, p_state text DEFAULT NULL, p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb := public.employee_withdrawal_read_standard(p_period,p_state,p_page);
  can_read_private boolean := auth.uid()='381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid
    AND coalesce((result->'capabilities'->>'admin')::boolean,false);
BEGIN
  RETURN jsonb_set(result,'{orders}',coalesce((
    SELECT jsonb_agg(entry || CASE WHEN p.order_id IS NULL THEN '{}'::jsonb ELSE
      jsonb_build_object('personal',true) || CASE WHEN can_read_private THEN
        jsonb_build_object('personal_amount',p.amount,'payment_reference',p.payment_reference)
        ELSE '{}'::jsonb END END ORDER BY n)
    FROM jsonb_array_elements(result->'orders') WITH ORDINALITY AS rows(entry,n)
    LEFT JOIN public.employee_withdrawal_personal p ON p.order_id=(entry->>'id')::uuid
  ),'[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.employee_withdrawal_read(date,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_read(date,text,integer) TO authenticated;

COMMIT;
