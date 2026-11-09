BEGIN;

-- Keep the sheet payload compatible with withdrawals created before the beneficiary migration.
CREATE OR REPLACE FUNCTION public.employee_withdrawal_claim_sheet(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c jsonb := public.employee_withdrawal_capabilities();
DECLARE w public.employee_withdrawals;
BEGIN
  SELECT * INTO w FROM public.employee_withdrawals WHERE order_id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')='service_role'
    OR coalesce((c->>'logistics')::boolean,false) OR coalesce((c->>'review')::boolean,false)
    OR (coalesce((c->>'create')::boolean,false) AND w.created_by=auth.uid())
  ) THEN RAISE EXCEPTION 'Retiro no disponible.'; END IF;
  IF w.sheet_version=w.version THEN RETURN jsonb_build_object('synced',true); END IF;
  IF w.sheet_lease_until>now() THEN RETURN jsonb_build_object('synced',false); END IF;
  UPDATE public.employee_withdrawals SET sheet_lease=gen_random_uuid(),sheet_lease_until=now()+interval '2 minutes'
    WHERE order_id=p_id RETURNING * INTO w;
  RETURN (SELECT jsonb_build_object(
    'lease',w.sheet_lease,'version',w.version,'row',w.sheet_row,'state',w.state,'status',o.status,
    'code',o.legacy_code,'category',o.category,'employee',o.customer_name,'created_at',o.created_at,
    'creator',w.created_by,'seller_name',(SELECT full_name FROM public.sellers WHERE id=w.created_by),
    'reconcile_operational',w.sheet_version>0 OR w.audit @> '[{"action":"approve"}]'::jsonb,
    'beneficiary_type',coalesce(o.totals->>'withdrawal_beneficiary_type','employee'),
    'delivery_closed',w.delivery_closed,'mode',o.employee_delivery_mode,'address',o.address,'locality',o.locality,
    'maps_link',o.google_maps_link,
    'order_date',o.order_date::date,'delivery_date',o.initial_delivery_date,'deadline',o.max_delivery_date,
    'phone',o.totals->>'delivery_phone','operational_note',o.totals->>'employee_operational_note',
    'total',o.total_amount,'discount_rate',o.totals->'order_discount_value',
    'items',(SELECT jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'price',i.unit_price,
      'sku',(SELECT sku FROM public.products WHERE id=i.product_id),
      'delivered',(SELECT coalesce(sum((e->>'delta')::integer),0) FROM jsonb_array_elements(w.delivery_events) e WHERE e->>'item_id'=i.id::text))
      ORDER BY i.id) FROM public.order_items i WHERE i.order_id=p_id)
  ) FROM public.orders o WHERE o.id=p_id);
END;
$$;

COMMIT;
