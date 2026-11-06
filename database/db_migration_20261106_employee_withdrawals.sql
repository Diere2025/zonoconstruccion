BEGIN;

ALTER TABLE public.orders ADD COLUMN employee_withdrawal boolean NOT NULL DEFAULT false;

CREATE TABLE public.employee_withdrawal_access (
  user_id uuid PRIMARY KEY REFERENCES public.sellers(id),
  employee_id uuid UNIQUE REFERENCES public.employees(id),
  can_review boolean NOT NULL DEFAULT false
);

CREATE TABLE public.employee_withdrawals (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  sheet_row integer GENERATED ALWAYS AS IDENTITY (START WITH 2) UNIQUE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_by uuid NOT NULL REFERENCES public.sellers(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','returned','rejected','cancelled')),
  version integer NOT NULL DEFAULT 1,
  sheet_version integer NOT NULL DEFAULT 0,
  sheet_lease uuid,
  sheet_lease_until timestamptz,
  review_note text NOT NULL DEFAULT '',
  agreement text NOT NULL DEFAULT '',
  delivery_events jsonb NOT NULL DEFAULT '[]',
  delivery_closed boolean NOT NULL DEFAULT false,
  credited_amount numeric(14,2) NOT NULL DEFAULT 0,
  audit jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE public.employee_withdrawal_installments (
  order_id uuid NOT NULL REFERENCES public.employee_withdrawals(order_id),
  number integer NOT NULL CHECK (number > 0),
  cadence text NOT NULL CHECK (cadence IN ('monthly','weekly')),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  expected_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  applied_at timestamptz,
  applied_on date,
  applied_by uuid REFERENCES public.sellers(id),
  payroll_reference text,
  PRIMARY KEY (order_id, number)
);

ALTER TABLE public.employee_withdrawal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_withdrawal_installments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_withdrawal_access, public.employee_withdrawals, public.employee_withdrawal_installments FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.employee_withdrawal_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE managed boolean;
BEGIN
  IF coalesce(current_setting('zono.employee_withdrawal_write', true), '') <> 'on' THEN
    IF TG_TABLE_NAME = 'orders' THEN
      managed := (TG_OP <> 'INSERT' AND OLD.employee_withdrawal) OR (TG_OP <> 'DELETE' AND NEW.employee_withdrawal);
    ELSE
      managed := EXISTS (
        SELECT 1 FROM public.orders
        WHERE employee_withdrawal AND (
          (TG_OP <> 'INSERT' AND id = OLD.order_id) OR
          (TG_OP <> 'DELETE' AND id = NEW.order_id)
        )
      );
    END IF;
    IF managed THEN
      RAISE EXCEPTION 'Gestioná este pedido desde Retiros de empleados.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER aa_employee_withdrawal_order BEFORE INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.employee_withdrawal_guard();
CREATE TRIGGER aa_employee_withdrawal_items BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.employee_withdrawal_guard();
CREATE TRIGGER aa_employee_withdrawal_delivery BEFORE INSERT OR UPDATE OR DELETE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.employee_withdrawal_guard();

CREATE FUNCTION public.employee_withdrawal_capabilities() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'admin', r.roles && ARRAY['admin'],
      'logistics', r.roles && ARRAY['logistica','admin'],
      'create', r.roles && ARRAY['seller','vendedor','logistica','admin'],
      'review', coalesce(a.can_review,false) OR r.roles && ARRAY['admin'],
      'user_id', s.id,
      'employee_id', a.employee_id)
    FROM public.sellers s
    CROSS JOIN LATERAL (SELECT array_append(coalesce(s.roles,ARRAY[]::text[]),s.role) AS roles) r
    LEFT JOIN public.employee_withdrawal_access a ON a.user_id=s.id
    WHERE s.id=auth.uid() AND s.is_active
  ), '{}'::jsonb);
$$;

CREATE FUNCTION public.employee_withdrawal_read(p_period date DEFAULT NULL, p_state text DEFAULT NULL, p_page integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE c jsonb := public.employee_withdrawal_capabilities();
DECLARE review boolean := coalesce((c->>'review')::boolean,false);
DECLARE logistics boolean := coalesce((c->>'logistics')::boolean,false);
BEGIN
  IF NOT (review OR logistics OR coalesce((c->>'create')::boolean,false)) THEN
    RAISE EXCEPTION 'No tenés acceso a retiros de empleados.';
  END IF;
  RETURN jsonb_build_object(
    'capabilities', c,
    'employees', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',full_name) ORDER BY full_name)
      FROM public.employees WHERE is_active AND (review OR logistics OR id=(c->>'employee_id')::uuid)), '[]'::jsonb),
    'accounts', CASE WHEN (c->>'admin')::boolean THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.full_name,'employee_id',a.employee_id,'can_review',coalesce(a.can_review,false)) ORDER BY s.full_name)
      FROM public.sellers s LEFT JOIN public.employee_withdrawal_access a ON a.user_id=s.id WHERE s.is_active
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'orders', coalesce((SELECT jsonb_agg(q.data ORDER BY q.sheet_row DESC) FROM (
      SELECT w.sheet_row, jsonb_build_object(
        'id',o.id,'code',o.legacy_code,'employee_id',w.employee_id,'employee',o.customer_name,'created_by',w.created_by,
        'state',w.state,'version',w.version,'sheet_pending',w.sheet_version<w.version,
        'status',o.status,'amount',o.total_amount,'created_at',o.created_at,'notes',o.delivery_notes,
        'category',o.category,'review_note',w.review_note,'delivery_events',w.delivery_events,'delivery_closed',w.delivery_closed,
        'items',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'name',i.product_name,
          'quantity',i.quantity,'price',i.unit_price) ORDER BY i.id) FROM public.order_items i WHERE i.order_id=o.id),
        'audit',CASE WHEN review THEN w.audit END,
        'agreement',CASE WHEN review THEN w.agreement END,
        'credited_amount',CASE WHEN review THEN w.credited_amount END,
        'installments',CASE WHEN review THEN coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.number)
          FROM public.employee_withdrawal_installments i WHERE i.order_id=o.id),'[]'::jsonb) END
      ) AS data
      FROM public.employee_withdrawals w JOIN public.orders o ON o.id=w.order_id
      WHERE (review OR logistics OR w.created_by=auth.uid())
        AND (p_state IS NULL OR w.state=p_state)
        AND (p_period IS NULL OR (review AND EXISTS (
          SELECT 1 FROM public.employee_withdrawal_installments i WHERE i.order_id=w.order_id
            AND i.period_end>=date_trunc('month',p_period)::date
            AND i.period_end<(date_trunc('month',p_period)+interval '1 month')::date
        )))
      ORDER BY w.sheet_row DESC LIMIT 50 OFFSET greatest(0,coalesce(p_page,0))::bigint*50
    ) q),'[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.employee_withdrawal_save(p_action text, p_id uuid, p_version integer, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c jsonb := public.employee_withdrawal_capabilities();
  actor uuid := auth.uid();
  reviewer boolean := coalesce((c->>'review')::boolean,false);
  logistics boolean := coalesce((c->>'logistics')::boolean,false);
  w public.employee_withdrawals;
  o public.orders;
  item public.order_items;
  product public.products;
  employee public.employees;
  entry jsonb;
  total numeric := 0;
  net_quantity integer;
  delta integer;
  available_amount numeric;
  period_start date;
  period_end date;
  due date;
  cadence text;
  amount numeric;
  idx integer := 0;
  note text := left(trim(coalesce(p_data->>'note','')), 500);
  operation_date date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  old_flag text := coalesce(current_setting('zono.employee_withdrawal_write',true),'');
BEGIN
  IF p_action='access' THEN
    IF NOT coalesce((c->>'admin')::boolean,false) THEN RAISE EXCEPTION 'Acceso reservado a administración.'; END IF;
    INSERT INTO public.employee_withdrawal_access(user_id,employee_id,can_review)
    VALUES(p_id,nullif(p_data->>'employee_id','')::uuid,coalesce((p_data->>'can_review')::boolean,false))
    ON CONFLICT(user_id) DO UPDATE SET employee_id=excluded.employee_id, can_review=excluded.can_review;
    RETURN p_id;
  END IF;

  IF p_action='create' THEN
    IF NOT coalesce((c->>'create')::boolean,false) THEN RAISE EXCEPTION 'No podés cargar retiros.'; END IF;
    -- The caller keeps the same UUID until the request succeeds.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
    IF EXISTS (SELECT 1 FROM public.employee_withdrawals WHERE order_id=p_id AND created_by=actor) THEN RETURN p_id; END IF;
  ELSE
    SELECT * INTO w FROM public.employee_withdrawals WHERE order_id=p_id FOR UPDATE;
    IF NOT FOUND OR NOT (reviewer OR logistics OR w.created_by=actor) THEN RAISE EXCEPTION 'Retiro no disponible.'; END IF;
    IF w.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'El retiro cambió. Actualizá la pantalla.'; END IF;
    SELECT * INTO o FROM public.orders WHERE id=p_id FOR UPDATE;
  END IF;
  PERFORM set_config('zono.employee_withdrawal_write','on',true);

  IF p_action IN ('create','edit') THEN
    IF NOT coalesce((c->>'create')::boolean,false) OR (p_action='edit' AND
      ((NOT logistics AND w.created_by<>actor) OR w.state NOT IN ('pending','returned','approved') OR w.delivery_events<>'[]')) THEN
      RAISE EXCEPTION 'Este retiro no se puede editar.';
    END IF;
    SELECT * INTO employee FROM public.employees WHERE id=(p_data->>'employee_id')::uuid AND is_active;
    IF NOT FOUND OR (NOT logistics AND employee.id IS DISTINCT FROM (c->>'employee_id')::uuid) THEN
      RAISE EXCEPTION 'Elegí un empleado habilitado. Ventas necesita una cuenta vinculada a su ficha de personal.';
    END IF;
    IF coalesce(jsonb_array_length(p_data->'items'),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Agregá entre 1 y 100 productos.'; END IF;
    IF p_action='create' THEN
      INSERT INTO public.orders(id,employee_withdrawal,seller_id,created_by_id,legacy_code,customer_name,order_date,
        initial_delivery_date,max_delivery_date,locality,address,freight_type,status,payment_status,category,delivery_notes)
      VALUES(p_id,true,actor,actor,'RE-'||upper(replace(p_id::text,'-','')),employee.full_name,operation_date,
        operation_date,operation_date,'Retiro en depósito','Retiro en depósito','Retiro en depósito',
        'En Espera','Pendiente',coalesce(p_data->>'category','OTRO'),'Retiro de empleado');
      INSERT INTO public.employee_withdrawals(order_id,employee_id,created_by) VALUES(p_id,employee.id,actor);
    ELSE
      DELETE FROM public.employee_withdrawal_installments WHERE order_id=p_id;
      DELETE FROM public.order_items WHERE order_id=p_id;
      UPDATE public.employee_withdrawals SET employee_id=employee.id,state='pending',agreement='',review_note='' WHERE order_id=p_id;
    END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
      SELECT * INTO product FROM public.products WHERE id=(entry->>'product_id')::uuid AND is_active
        AND NOT is_service AND NOT coalesce(is_generic,false) AND NOT coalesce(is_outlet_unit,false);
      delta := (entry->>'quantity')::integer;
      amount := (entry->>'price')::numeric;
      IF NOT FOUND OR delta IS NULL OR delta NOT BETWEEN 1 AND 10000 OR amount IS NULL OR amount<0
        OR amount>9999999999 OR amount<>round(amount,2) THEN
        RAISE EXCEPTION 'Revisá el producto, la cantidad y el precio.';
      END IF;
      INSERT INTO public.order_items(order_id,product_id,product_name,quantity,unit_price,historical_unit_cost)
      VALUES(p_id,product.id,product.name,delta,amount,coalesce(product.cost_price,0));
      total := total+delta*amount;
    END LOOP;
    UPDATE public.orders SET customer_name=employee.full_name,category=coalesce(p_data->>'category','OTRO'),
      total_amount=total, totals=jsonb_build_object('total',total), status='En Espera',
      delivery_notes=concat_ws(' · ','Retiro de empleado',nullif(note,'')), hold_reason='Autorización de RR. HH.'
      WHERE id=p_id;

  ELSIF p_action IN ('approve','return','reject','reschedule') THEN
    IF NOT reviewer OR (p_action='reschedule' AND w.state<>'approved')
      OR (p_action<>'reschedule' AND w.state<>'pending') THEN RAISE EXCEPTION 'La revisión no está disponible.'; END IF;
    IF p_action IN ('approve','reschedule') THEN
      IF p_action='approve' AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id=w.employee_id AND is_active)
        THEN RAISE EXCEPTION 'El empleado ya no está activo.'; END IF;
      IF note='' THEN RAISE EXCEPTION 'Registrá el acuerdo o el motivo de la reprogramación.'; END IF;
      IF coalesce(jsonb_array_length(p_data->'installments'),0)>60 THEN RAISE EXCEPTION 'Usá hasta 60 cuotas.'; END IF;
      IF coalesce(jsonb_array_length(p_data->'installments'),0)>0 AND p_data->>'period_checked' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Confirmá que los períodos salariales estén habilitados para el descuento.';
      END IF;
      SELECT coalesce(sum(i.amount),0),coalesce(max(i.number),0) INTO total,idx
        FROM public.employee_withdrawal_installments i WHERE i.order_id=p_id AND i.applied_at IS NOT NULL;
      DELETE FROM public.employee_withdrawal_installments WHERE order_id=p_id AND applied_at IS NULL;
      FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_data->'installments','[]')) LOOP
        idx := idx+1;
        cadence := entry->>'cadence';
        period_start := (entry->>'period_start')::date;
        period_end := (entry->>'period_end')::date;
        due := (entry->>'expected_on')::date;
        amount := (entry->>'amount')::numeric;
        IF cadence='monthly' THEN
          period_end := (period_start+interval '1 month - 1 day')::date;
          IF extract(day FROM period_start)<>1 THEN RAISE EXCEPTION 'Elegí el mes salarial completo.'; END IF;
        ELSIF cadence='weekly' AND period_end IS DISTINCT FROM period_start+6 THEN
          RAISE EXCEPTION 'El período semanal debe tener siete días.';
        END IF;
        IF amount IS NULL OR amount<=0 OR amount<>round(amount,2) OR due IS NULL THEN
          RAISE EXCEPTION 'Revisá el importe y la fecha prevista de cada cuota.';
        END IF;
        INSERT INTO public.employee_withdrawal_installments(order_id,number,cadence,period_start,period_end,expected_on,amount)
          VALUES(p_id,idx,cadence,period_start,period_end,due,amount);
        total := total+amount;
      END LOOP;
      available_amount := o.total_amount;
      IF w.delivery_closed THEN
        SELECT coalesce(sum((e->>'delta')::integer*i.unit_price),0) INTO available_amount
          FROM jsonb_array_elements(w.delivery_events) e JOIN public.order_items i ON i.id=(e->>'item_id')::uuid;
      END IF;
      IF total-w.credited_amount<>available_amount THEN RAISE EXCEPTION 'Las cuotas deben sumar el importe acordado o el efectivamente entregado si se cerró la entrega.'; END IF;
      UPDATE public.employee_withdrawals SET state='approved',
        agreement=CASE WHEN p_action='approve' THEN note ELSE agreement END,review_note='' WHERE order_id=p_id;
      UPDATE public.orders SET status=CASE WHEN p_action='approve' THEN 'Confirmado' ELSE status END,hold_reason=NULL WHERE id=p_id;
    ELSE
      IF note='' THEN RAISE EXCEPTION 'Indicá el motivo.'; END IF;
      UPDATE public.employee_withdrawals SET state=CASE p_action WHEN 'return' THEN 'returned' ELSE 'rejected' END,
        review_note=note WHERE order_id=p_id;
      IF p_action='reject' THEN UPDATE public.orders SET status='Cancelado' WHERE id=p_id; END IF;
    END IF;

  ELSIF p_action IN ('deliver','refund') THEN
    IF NOT logistics OR w.state<>'approved' THEN RAISE EXCEPTION 'El retiro debe estar autorizado por RR. HH.'; END IF;
    IF p_action='deliver' AND w.delivery_closed THEN RAISE EXCEPTION 'La entrega ya se cerró.'; END IF;
    SELECT * INTO item FROM public.order_items WHERE id=(p_data->>'item_id')::uuid AND order_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto del retiro no encontrado.'; END IF;
    SELECT coalesce(sum((e->>'delta')::integer),0) INTO net_quantity FROM jsonb_array_elements(w.delivery_events) e WHERE e->>'item_id'=item.id::text;
    delta := (p_data->>'quantity')::integer;
    IF delta IS NULL OR delta<=0 OR (p_action='deliver' AND net_quantity+delta>item.quantity)
      OR (p_action='refund' AND delta>net_quantity) THEN RAISE EXCEPTION 'La cantidad supera el saldo de esa línea.'; END IF;
    IF p_action='refund' THEN delta := -delta; END IF;
    SELECT * INTO product FROM public.products WHERE id=item.product_id FOR UPDATE;
    IF delta>0 AND coalesce(product.stock_current,0)<delta THEN RAISE EXCEPTION 'Stock disponible insuficiente.'; END IF;
    INSERT INTO public.inventory_transactions(product_id,quantity,type,reference_id,user_id)
      VALUES(item.product_id,-delta,'Ajuste',p_id,actor);
    w.delivery_events := w.delivery_events || jsonb_build_array(jsonb_build_object('item_id',item.id,'delta',delta,'at',now(),'actor',actor));
    UPDATE public.employee_withdrawals SET delivery_events=w.delivery_events WHERE order_id=p_id;
    UPDATE public.orders SET status=CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items i WHERE i.order_id=p_id AND i.quantity<>(
        SELECT coalesce(sum((e->>'delta')::integer),0) FROM jsonb_array_elements(w.delivery_events) e WHERE e->>'item_id'=i.id::text
      )) THEN 'Entregado' ELSE 'Confirmado' END WHERE id=p_id;

  ELSIF p_action='close_delivery' THEN
    IF NOT logistics OR w.state<>'approved' OR w.delivery_closed OR note='' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(w.delivery_events) e GROUP BY e->>'item_id' HAVING sum((e->>'delta')::integer)>0
    ) THEN RAISE EXCEPTION 'Registrá al menos una entrega e indicá el motivo del cierre.'; END IF;
    UPDATE public.employee_withdrawals SET delivery_closed=true WHERE order_id=p_id;

  ELSIF p_action='apply' THEN
    IF NOT reviewer OR w.state<>'approved' OR note='' THEN RAISE EXCEPTION 'Ingresá la referencia del descuento aplicado.'; END IF;
    due := (p_data->>'applied_on')::date;
    IF due IS NULL OR due>operation_date THEN RAISE EXCEPTION 'Ingresá la fecha efectiva del descuento.'; END IF;
    SELECT coalesce(sum((e->>'delta')::integer*i.unit_price),0) INTO available_amount
      FROM jsonb_array_elements(w.delivery_events) e JOIN public.order_items i ON i.id=(e->>'item_id')::uuid;
    SELECT coalesce(sum(i.amount),0) INTO total FROM public.employee_withdrawal_installments i WHERE i.order_id=p_id AND i.applied_at IS NOT NULL;
    UPDATE public.employee_withdrawal_installments i SET applied_at=now(),applied_on=due,applied_by=actor,payroll_reference=note
      WHERE i.order_id=p_id AND i.number=(p_data->>'number')::integer AND i.applied_at IS NULL
        AND total-w.credited_amount+i.amount<=available_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'La cuota ya fue aplicada o supera el importe efectivamente entregado.'; END IF;

  ELSIF p_action='credit' THEN
    IF NOT reviewer OR w.state<>'approved' OR note='' THEN RAISE EXCEPTION 'Ingresá la referencia del reintegro aplicado.'; END IF;
    SELECT coalesce(sum((e->>'delta')::integer*i.unit_price),0) INTO available_amount
      FROM jsonb_array_elements(w.delivery_events) e JOIN public.order_items i ON i.id=(e->>'item_id')::uuid;
    SELECT coalesce(sum(i.amount),0) INTO total FROM public.employee_withdrawal_installments i WHERE i.order_id=p_id AND i.applied_at IS NOT NULL;
    amount := (p_data->>'amount')::numeric;
    IF amount IS NULL OR amount<=0 OR amount<>round(amount,2) OR amount>total-w.credited_amount-available_amount THEN
      RAISE EXCEPTION 'El reintegro supera el importe descontado por encima de lo entregado.';
    END IF;
    UPDATE public.employee_withdrawals SET credited_amount=credited_amount+amount WHERE order_id=p_id;

  ELSIF p_action='cancel' THEN
    IF NOT logistics AND NOT reviewer THEN RAISE EXCEPTION 'No podés cancelar este retiro.'; END IF;
    IF w.state NOT IN ('pending','returned','approved') OR note='' OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(w.delivery_events) e GROUP BY e->>'item_id' HAVING sum((e->>'delta')::integer)<>0
    ) OR w.credited_amount<>(SELECT coalesce(sum(i.amount),0) FROM public.employee_withdrawal_installments i WHERE order_id=p_id AND applied_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Para cancelar, indicá el motivo y resolvé las entregas y los descuentos aplicados.'; END IF;
    UPDATE public.employee_withdrawals SET state='cancelled',review_note=note WHERE order_id=p_id;
    UPDATE public.orders SET status='Cancelado' WHERE id=p_id;
  ELSE
    RAISE EXCEPTION 'Acción no válida.';
  END IF;

  UPDATE public.employee_withdrawals SET version=version+1,
    audit=audit || jsonb_build_array(jsonb_build_object('action',p_action,'by',actor,
      'actor_name',(SELECT full_name FROM public.sellers WHERE id=actor),'at',now(),'data',p_data))
    WHERE order_id=p_id;
  PERFORM set_config('zono.employee_withdrawal_write',old_flag,true);
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_withdrawal_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.employee_withdrawal_capabilities(), public.employee_withdrawal_read(date,text,integer),
  public.employee_withdrawal_save(text,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_capabilities(), public.employee_withdrawal_read(date,text,integer),
  public.employee_withdrawal_save(text,uuid,integer,jsonb) TO authenticated;

CREATE FUNCTION public.employee_withdrawal_claim_sheet(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c jsonb := public.employee_withdrawal_capabilities();
DECLARE w public.employee_withdrawals;
BEGIN
  SELECT * INTO w FROM public.employee_withdrawals WHERE order_id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    coalesce((c->>'logistics')::boolean,false) OR coalesce((c->>'review')::boolean,false)
    OR (coalesce((c->>'create')::boolean,false) AND w.created_by=auth.uid())
  ) THEN RAISE EXCEPTION 'Retiro no disponible.'; END IF;
  IF w.sheet_version=w.version THEN RETURN jsonb_build_object('synced',true); END IF;
  IF w.sheet_lease_until>now() THEN RETURN jsonb_build_object('synced',false); END IF;
  UPDATE public.employee_withdrawals SET sheet_lease=gen_random_uuid(),sheet_lease_until=now()+interval '2 minutes'
    WHERE order_id=p_id RETURNING * INTO w;
  RETURN (SELECT jsonb_build_object(
    'lease',w.sheet_lease,'version',w.version,'row',w.sheet_row,'state',w.state,'status',o.status,
    'code',o.legacy_code,'category',o.category,'employee',o.customer_name,'created_at',o.created_at,
    'creator',w.created_by,
    'delivery_closed',w.delivery_closed,
    'items',(SELECT jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,
      'delivered',(SELECT coalesce(sum((e->>'delta')::integer),0) FROM jsonb_array_elements(w.delivery_events) e WHERE e->>'item_id'=i.id::text))
      ORDER BY i.id) FROM public.order_items i WHERE i.order_id=p_id)
  ) FROM public.orders o WHERE o.id=p_id);
END;
$$;

CREATE FUNCTION public.employee_withdrawal_finish_sheet(p_id uuid,p_lease uuid,p_version integer,p_success boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE synced boolean;
BEGIN
  UPDATE public.employee_withdrawals SET sheet_lease=NULL,sheet_lease_until=NULL,
    sheet_version=CASE WHEN p_success THEN greatest(sheet_version,p_version) ELSE sheet_version END
    WHERE order_id=p_id AND sheet_lease=p_lease
    RETURNING sheet_version=version INTO synced;
  RETURN coalesce(synced,false);
END;
$$;
REVOKE ALL ON FUNCTION public.employee_withdrawal_claim_sheet(uuid), public.employee_withdrawal_finish_sheet(uuid,uuid,integer,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_claim_sheet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_withdrawal_finish_sheet(uuid,uuid,integer,boolean) TO service_role;

COMMIT;
