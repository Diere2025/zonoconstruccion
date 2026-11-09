BEGIN;

ALTER TABLE public.employee_withdrawals
  ALTER COLUMN employee_id DROP NOT NULL,
  ADD COLUMN carrier_id uuid REFERENCES public.carriers(id),
  ADD COLUMN external_name text,
  ADD COLUMN external_reference text,
  ADD CONSTRAINT employee_withdrawal_one_beneficiary
    CHECK (num_nonnulls(employee_id,carrier_id,external_name)=1),
  ADD CONSTRAINT employee_withdrawal_external_reference_required
    CHECK (external_name IS NULL OR (external_reference IS NOT NULL AND length(trim(external_reference))>=3));

CREATE OR REPLACE FUNCTION public.employee_withdrawal_read(p_period date DEFAULT NULL, p_state text DEFAULT NULL, p_page integer DEFAULT 0) RETURNS jsonb
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
    'carriers', CASE WHEN logistics THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id)
      FROM public.carriers WHERE is_active
    ),'[]'::jsonb) END,
    'accounts', CASE WHEN (c->>'admin')::boolean THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.full_name,'employee_id',a.employee_id,'can_review',coalesce(a.can_review,false)) ORDER BY s.full_name)
      FROM public.sellers s LEFT JOIN public.employee_withdrawal_access a ON a.user_id=s.id WHERE s.is_active
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'orders', coalesce((SELECT jsonb_agg(q.data ORDER BY q.sheet_row DESC) FROM (
      SELECT w.sheet_row, jsonb_build_object(
        'id',o.id,'code',o.legacy_code,'employee_id',w.employee_id,'employee',o.customer_name,'created_by',w.created_by,
        'carrier_id',w.carrier_id,'external_name',w.external_name,'external_reference',w.external_reference,
        'state',w.state,'version',w.version,'sheet_pending',w.sheet_version<w.version,
        'status',o.status,'amount',o.total_amount,'created_at',o.created_at,'notes',o.delivery_notes,
        'category',o.category,'mode',o.employee_delivery_mode,'address',o.address,'locality',o.locality,
        'delivery_date',o.initial_delivery_date,'deadline',o.max_delivery_date,'phone',o.totals->>'delivery_phone','maps_link',o.google_maps_link,
        'discount_rate',o.totals->'order_discount_value',
        'discount_amount',o.order_discount_amount,'operational_note',o.totals->>'employee_operational_note','review_note',w.review_note,'delivery_events',w.delivery_events,'delivery_closed',w.delivery_closed,
        'items',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'name',i.product_name,
          'quantity',i.quantity,'price',i.unit_price,'sku',(SELECT sku FROM public.products WHERE id=i.product_id)) ORDER BY i.id) FROM public.order_items i WHERE i.order_id=o.id),
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

CREATE OR REPLACE FUNCTION public.employee_withdrawal_save(p_action text, p_id uuid, p_version integer, p_data jsonb)
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
  carrier public.carriers;
  manual_name text;
  beneficiary_reference text;
  beneficiary_name text;
  beneficiary_type text;
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
  discount_amount numeric;
  discount_rate numeric;
  mode text;
  address_value text;
  locality_value text;
  maps_value text;
  phone_value text;
  delivery_day date;
  delivery_deadline date;
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
    beneficiary_type := coalesce(p_data->>'beneficiary_type','employee');
    IF beneficiary_type <> 'employee' AND NOT logistics THEN
      RAISE EXCEPTION 'Solo Logística puede cargar retiros para personas externas.';
    END IF;
    IF beneficiary_type='employee' THEN
      SELECT * INTO employee FROM public.employees WHERE id=(p_data->>'employee_id')::uuid AND is_active;
      IF NOT FOUND OR (NOT logistics AND employee.id IS DISTINCT FROM (c->>'employee_id')::uuid) THEN
        RAISE EXCEPTION 'Elegí un empleado habilitado. Ventas necesita una cuenta vinculada a su ficha de personal.';
      END IF;
      beneficiary_name := employee.full_name;
    ELSIF beneficiary_type='carrier' THEN
      SELECT * INTO carrier FROM public.carriers WHERE id=(p_data->>'carrier_id')::uuid AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'Elegí un fletero activo.'; END IF;
      beneficiary_name := carrier.name;
      beneficiary_reference := nullif(left(trim(coalesce(p_data->>'external_reference','')),250),'');
    ELSIF beneficiary_type='external' THEN
      manual_name := trim(coalesce(p_data->>'external_name',''));
      beneficiary_reference := trim(coalesce(p_data->>'external_reference',''));
      IF length(manual_name) NOT BETWEEN 2 AND 160 OR length(beneficiary_reference) NOT BETWEEN 3 AND 250 THEN
        RAISE EXCEPTION 'Ingresá el nombre de la persona y una referencia de entre 3 y 250 caracteres.';
      END IF;
      beneficiary_name := manual_name;
    ELSE
      RAISE EXCEPTION 'Elegí un tipo de beneficiario válido.';
    END IF;
    IF coalesce(jsonb_array_length(p_data->'items'),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Agregá entre 1 y 100 productos.'; END IF;
    mode := coalesce(p_data->>'mode',CASE WHEN p_action='edit' THEN o.employee_delivery_mode END,'pickup');
    IF mode NOT IN ('pickup','home') THEN RAISE EXCEPTION 'Elegí una modalidad de entrega válida.'; END IF;
    IF p_action='edit' THEN
      PERFORM 1 FROM public.deliveries WHERE order_id=p_id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id=p_id AND (route_sheet_id IS NOT NULL OR status IN ('en_recorrido','entregado'))) THEN
        RAISE EXCEPTION 'Quitá primero el pedido del recorrido para poder corregirlo.';
      END IF;
    END IF;
    address_value := CASE WHEN mode='home' THEN left(trim(coalesce(p_data->>'address','')),250) ELSE 'Retiro en depósito' END;
    locality_value := CASE WHEN mode='home' THEN left(trim(coalesce(p_data->>'locality','')),150) ELSE 'Retiro en depósito' END;
    maps_value := CASE WHEN mode='home' THEN nullif(trim(coalesce(p_data->>'maps_link','')),'') END;
    IF maps_value IS NOT NULL AND (length(maps_value)>2048 OR maps_value !~
      '^https://(www\.google\.(com|com\.ar)/maps([/?#]|$)|maps\.google\.(com|com\.ar)([/?#]|$)|maps\.app\.goo\.gl/|goo\.gl/maps/)') THEN
      RAISE EXCEPTION 'Ingresá un enlace válido de Google Maps.';
    END IF;
    phone_value := CASE WHEN mode='home' THEN left(trim(coalesce(p_data->>'phone','')),50) END;
    delivery_day := CASE WHEN mode='home' THEN nullif(p_data->>'delivery_date','')::date ELSE operation_date END;
    delivery_deadline := CASE WHEN mode='home' AND p_data ? 'deadline' THEN nullif(p_data->>'deadline','')::date ELSE delivery_day END;
    IF mode='home' AND (address_value='' OR locality_value='' OR phone_value='' OR delivery_day IS NULL OR delivery_deadline IS NULL) THEN
      RAISE EXCEPTION 'Completá domicilio, localidad, teléfono y plazo de entrega.';
    END IF;
    IF delivery_deadline < delivery_day THEN
      RAISE EXCEPTION 'La fecha Hasta debe ser igual o posterior a Desde.';
    END IF;
    IF p_action='create' THEN
      INSERT INTO public.orders(id,employee_withdrawal,seller_id,created_by_id,customer_name,order_date,
        initial_delivery_date,max_delivery_date,locality,address,freight_type,status,payment_status,category,delivery_notes)
      VALUES(p_id,true,actor,actor,beneficiary_name,operation_date,
        operation_date,operation_date,'Retiro en depósito','Retiro en depósito','Retiro en depósito',
        'En Espera','Pendiente',coalesce(p_data->>'category','OTRO'),'Retiro de empleado');
      INSERT INTO public.employee_withdrawals(order_id,employee_id,carrier_id,external_name,external_reference,created_by)
        VALUES(p_id,employee.id,carrier.id,manual_name,beneficiary_reference,actor);
    ELSE
      DELETE FROM public.employee_withdrawal_installments WHERE order_id=p_id;
      DELETE FROM public.order_items WHERE order_id=p_id;
      UPDATE public.employee_withdrawals SET employee_id=employee.id,carrier_id=carrier.id,
        external_name=manual_name,external_reference=beneficiary_reference,state='pending',agreement='',review_note='' WHERE order_id=p_id;
    END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(p_data->'items') LOOP
      SELECT * INTO product FROM public.products WHERE id=(entry->>'product_id')::uuid AND is_active
        AND NOT is_service AND NOT coalesce(is_generic,false) AND NOT coalesce(is_outlet_unit,false) AND name NOT ILIKE 'descuento%';
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
    discount_rate := coalesce((p_data->>'discount_rate')::numeric,
      CASE WHEN p_action='edit' AND (w.employee_id IS NOT NULL)=(employee.id IS NOT NULL)
        THEN (o.totals->>'order_discount_value')::numeric END,
      CASE WHEN employee.id IS NOT NULL THEN 5 ELSE 0 END);
    IF discount_rate NOT BETWEEN 0 AND 100 OR discount_rate<>round(discount_rate,2) THEN
      RAISE EXCEPTION 'Ingresá un descuento entre 0 y 100 con hasta dos decimales.';
    END IF;
    discount_amount := round(total*discount_rate/100,2);
    UPDATE public.orders SET customer_name=beneficiary_name,category=coalesce(p_data->>'category','OTRO'),
      employee_delivery_mode=mode,address=address_value,locality=locality_value,google_maps_link=maps_value,
      initial_delivery_date=delivery_day,max_delivery_date=delivery_deadline,
      freight_type=CASE WHEN mode='home' THEN 'Flete Regular' ELSE 'Retiro en depósito' END,
      order_discount_type='percentage',order_discount_value=discount_rate,order_discount_amount=discount_amount,
      total_amount=total-discount_amount,
      totals=jsonb_build_object('total',total-discount_amount,'items_subtotal',total,'subtotal',total-discount_amount,
        'order_discount_type','percentage','order_discount_value',discount_rate,'order_discount_amount',discount_amount,
        'employee_operational_note',note,'withdrawal_beneficiary_type',beneficiary_type,'delivery_phone',phone_value,'pending_balance',0,
        'customer_snapshot',jsonb_build_object('name',beneficiary_name,'phone_primary',phone_value)),
      status='En Espera',
      delivery_notes=concat_ws(' · ','Retiro de empleado',nullif(note,'')), hold_reason='Autorización de RR. HH.'
      WHERE id=p_id;
    UPDATE public.deliveries SET delivery_date=delivery_day,status='pendiente_ruteo' WHERE order_id=p_id;

  ELSIF p_action IN ('approve','return','reject','reschedule') THEN
    IF NOT reviewer OR (p_action='reschedule' AND w.state<>'approved')
      OR (p_action<>'reschedule' AND w.state<>'pending') THEN RAISE EXCEPTION 'La revisión no está disponible.'; END IF;
    IF p_action IN ('approve','reschedule') THEN
      IF p_action='approve' AND w.employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id=w.employee_id AND is_active)
        THEN RAISE EXCEPTION 'El empleado ya no está activo.'; END IF;
      IF note='' THEN RAISE EXCEPTION 'Registrá el acuerdo o el motivo de la reprogramación.'; END IF;
      IF w.carrier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.carriers WHERE id=w.carrier_id AND is_active) THEN
        RAISE EXCEPTION 'El fletero ya no está activo.';
      END IF;
      IF w.employee_id IS NULL THEN
        IF p_action='reschedule' OR coalesce(jsonb_array_length(p_data->'installments'),0)>0 THEN
          RAISE EXCEPTION 'Los retiros de terceros no admiten cuotas por nómina.';
        END IF;
      ELSE
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
          SELECT coalesce(sum((e->>'delta')::integer*i.unit_price),0) - round(coalesce(sum((e->>'delta')::integer*i.unit_price),0)*coalesce(o.order_discount_value,0)/100,2) INTO available_amount
            FROM jsonb_array_elements(w.delivery_events) e JOIN public.order_items i ON i.id=(e->>'item_id')::uuid;
        END IF;
        IF total-w.credited_amount<>available_amount THEN RAISE EXCEPTION 'Las cuotas deben sumar el importe acordado o el efectivamente entregado si se cerró la entrega.'; END IF;
      END IF;
      UPDATE public.employee_withdrawals SET state='approved',
        agreement=CASE WHEN p_action='approve' THEN note ELSE agreement END,review_note='' WHERE order_id=p_id;
      UPDATE public.orders SET status=CASE WHEN p_action='approve' THEN CASE WHEN employee_delivery_mode='home' THEN 'Pendiente' ELSE 'Confirmado' END ELSE status END,hold_reason=NULL WHERE id=p_id;
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
      )) THEN 'Entregado'
      WHEN o.employee_delivery_mode='home' AND o.status='Entregando' THEN 'Entregando'
      WHEN o.employee_delivery_mode='home' THEN 'Pendiente' ELSE 'Confirmado' END WHERE id=p_id;
    IF o.employee_delivery_mode='home' AND EXISTS (SELECT 1 FROM public.orders WHERE id=p_id AND status='Entregado') THEN
      UPDATE public.deliveries SET real_delivery_date=operation_date,status='entregado' WHERE order_id=p_id;
    END IF;

  ELSIF p_action='close_delivery' THEN
    IF NOT logistics OR w.state<>'approved' OR w.delivery_closed OR note='' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(w.delivery_events) e GROUP BY e->>'item_id' HAVING sum((e->>'delta')::integer)>0
    ) THEN RAISE EXCEPTION 'Registrá al menos una entrega e indicá el motivo del cierre.'; END IF;
    UPDATE public.employee_withdrawals SET delivery_closed=true WHERE order_id=p_id;

  ELSIF p_action='apply' THEN
    IF w.employee_id IS NULL THEN RAISE EXCEPTION 'El retiro de un tercero no se descuenta por nómina.'; END IF;
    IF NOT reviewer OR w.state<>'approved' OR note='' THEN RAISE EXCEPTION 'Ingresá la referencia del descuento aplicado.'; END IF;
    due := (p_data->>'applied_on')::date;
    IF due IS NULL OR due>operation_date THEN RAISE EXCEPTION 'Ingresá la fecha efectiva del descuento.'; END IF;
    SELECT coalesce(sum((e->>'delta')::integer*i.unit_price),0) - round(coalesce(sum((e->>'delta')::integer*i.unit_price),0)*coalesce(o.order_discount_value,0)/100,2) INTO available_amount
      FROM jsonb_array_elements(w.delivery_events) e JOIN public.order_items i ON i.id=(e->>'item_id')::uuid;
    SELECT coalesce(sum(i.amount),0) INTO total FROM public.employee_withdrawal_installments i WHERE i.order_id=p_id AND i.applied_at IS NOT NULL;
    UPDATE public.employee_withdrawal_installments i SET applied_at=now(),applied_on=due,applied_by=actor,payroll_reference=note
      WHERE i.order_id=p_id AND i.number=(p_data->>'number')::integer AND i.applied_at IS NULL
        AND total-w.credited_amount+i.amount<=available_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'La cuota ya fue aplicada o supera el importe efectivamente entregado.'; END IF;

  ELSIF p_action='credit' THEN
    IF w.employee_id IS NULL THEN RAISE EXCEPTION 'El retiro de un tercero no tiene reintegros por nómina.'; END IF;
    IF NOT reviewer OR w.state<>'approved' OR note='' THEN RAISE EXCEPTION 'Ingresá la referencia del reintegro aplicado.'; END IF;
    SELECT coalesce(sum((e->>'delta')::integer*i.unit_price),0) - round(coalesce(sum((e->>'delta')::integer*i.unit_price),0)*coalesce(o.order_discount_value,0)/100,2) INTO available_amount
      FROM jsonb_array_elements(w.delivery_events) e JOIN public.order_items i ON i.id=(e->>'item_id')::uuid;
    SELECT coalesce(sum(i.amount),0) INTO total FROM public.employee_withdrawal_installments i WHERE i.order_id=p_id AND i.applied_at IS NOT NULL;
    amount := (p_data->>'amount')::numeric;
    IF amount IS NULL OR amount<=0 OR amount<>round(amount,2) OR amount>total-w.credited_amount-available_amount THEN
      RAISE EXCEPTION 'El reintegro supera el importe descontado por encima de lo entregado.';
    END IF;
    UPDATE public.employee_withdrawals SET credited_amount=credited_amount+amount WHERE order_id=p_id;

  ELSIF p_action='cancel' THEN
    IF NOT logistics AND NOT reviewer THEN RAISE EXCEPTION 'No podés cancelar este retiro.'; END IF;
    PERFORM 1 FROM public.deliveries WHERE order_id=p_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id=p_id AND route_sheet_id IS NOT NULL AND status IN ('ruteado','en_recorrido')) THEN
      RAISE EXCEPTION 'Quitá primero el pedido del recorrido para poder cancelarlo.';
    END IF;
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

COMMIT;
