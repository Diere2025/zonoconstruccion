BEGIN;
CREATE OR REPLACE FUNCTION public.outlet_sync_product() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE flag text:=coalesce(current_setting('zono.outlet_write',true),'');
BEGIN
 IF NEW.product_id IS NOT NULL THEN
  PERFORM set_config('zono.outlet_write','on',true);
  UPDATE public.products SET name=NEW.name || ' · ' || CASE NEW.condition WHEN 'segunda' THEN 'Segunda' ELSE 'Outlet' END || ' [' || NEW.code || ']',
   sku=NEW.code,description=concat_ws(E'\n',NEW.reason,nullif(NEW.defect,'')),category=NEW.category,
   price=CASE WHEN NEW.state IN ('reserved','sold') THEN coalesce((SELECT (snapshot->>'final_price')::numeric FROM public.outlet_assignments WHERE unit_id=NEW.id AND released_at IS NULL),0) ELSE coalesce(round(public.outlet_effective_list(NEW)*(1-NEW.discount/100),2),0) END,cost_price=NEW.cost_price,
   is_active=false,fixed_price=true,is_generic=false,parent_id=null,mapped_real_product_id=null,
   stock_physical=CASE WHEN NEW.state='sold' OR NOT NEW.physical_present THEN 0 ELSE 1 END,
   stock_reserved=CASE WHEN NEW.state='reserved' THEN 1 ELSE 0 END,
   stock_current=CASE WHEN NEW.state='available' THEN 1 ELSE 0 END
  WHERE id=NEW.product_id;
  PERFORM set_config('zono.outlet_write',flag,true);
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.outlet_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE a record; flag text:=coalesce(current_setting('zono.outlet_write',true),'');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.outlet_assignments WHERE order_id=OLD.id) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Un pedido con unidades únicas se cancela; no se elimina su historial.'; END IF;
 IF flag='on' THEN RETURN NEW; END IF;
 IF jsonb_build_array(NEW.total_amount,NEW.order_discount_type,NEW.order_discount_value,NEW.order_discount_amount,NEW.totals->'items_subtotal',NEW.totals->'subtotal',NEW.totals->'freight',NEW.totals->'tax',NEW.totals->'payment_surcharges',NEW.totals->'total',NEW.totals->'order_discounts',NEW.totals->'order_discount_amount') IS DISTINCT FROM jsonb_build_array(OLD.total_amount,OLD.order_discount_type,OLD.order_discount_value,OLD.order_discount_amount,OLD.totals->'items_subtotal',OLD.totals->'subtotal',OLD.totals->'freight',OLD.totals->'tax',OLD.totals->'payment_surcharges',OLD.totals->'total',OLD.totals->'order_discounts',OLD.totals->'order_discount_amount') THEN RAISE EXCEPTION 'Editá los importes del pedido mediante la reserva de Segunda y Outlet.'; END IF;
 IF NEW.channel='mayorista' AND NEW.channel IS DISTINCT FROM OLD.channel THEN RAISE EXCEPTION 'Las unidades únicas pertenecen al circuito minorista.'; END IF;
 -- All stock/reservation transitions serialize on unit rows, in the same order as saves.
 PERFORM 1 FROM public.outlet_units u JOIN public.outlet_assignments a ON a.unit_id=u.id WHERE a.order_id=OLD.id ORDER BY u.id FOR UPDATE OF u;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  FOR a IN SELECT x.*,u.state FROM public.outlet_assignments x JOIN public.outlet_units u ON u.id=x.unit_id WHERE x.order_id=OLD.id AND (x.released_at IS NULL OR x.id IN(SELECT DISTINCT ON(unit_id) id FROM public.outlet_assignments WHERE order_id=OLD.id ORDER BY unit_id,created_at DESC)) LOOP
   IF NEW.status IN ('Cancelado','Anulado') THEN
    IF a.released_at IS NULL THEN
     UPDATE public.outlet_assignments SET released_at=now() WHERE id=a.id;
     UPDATE public.outlet_units SET state=CASE WHEN a.state IN ('sold','review') OR OLD.status='Entregado' THEN 'review' WHEN a.state IN ('withdrawn') THEN a.state ELSE 'available' END WHERE id=a.unit_id;
    END IF;
   ELSIF OLD.status IN ('Cancelado','Anulado') THEN
    IF a.state<>'available' OR EXISTS(SELECT 1 FROM public.outlet_assignments WHERE unit_id=a.unit_id AND released_at IS NULL) THEN RAISE EXCEPTION 'La unidad ya no está disponible para reactivar el pedido.'; END IF;
    INSERT INTO public.outlet_assignments(unit_id,order_id,snapshot) VALUES(a.unit_id,OLD.id,a.snapshot);
    UPDATE public.outlet_units SET state='reserved' WHERE id=a.unit_id;
   ELSIF NEW.status='Entregado' AND a.released_at IS NULL THEN
    IF a.state<>'reserved' THEN RAISE EXCEPTION 'La unidad requiere revisión antes de entregar.'; END IF;
    UPDATE public.outlet_units SET state='sold',physical_present=false WHERE id=a.unit_id;
   ELSIF OLD.status='Entregado' AND NEW.status<>'Entregado' AND a.released_at IS NULL THEN
    UPDATE public.outlet_units SET state='review' WHERE id=a.unit_id;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.outlet_save_order(p_operation uuid,p_order_id uuid,p_order jsonb,p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE actor uuid:=auth.uid(); o public.orders; old_o public.orders; rowdata jsonb; keys text; vals text; item jsonb; u public.outlet_units; a public.outlet_assignments; snap jsonb; price numeric; reference_price numeric; quotes jsonb:='{}'; regular numeric:=0; gross numeric:=0; discount numeric; expected numeric; v_result jsonb; flag text:=coalesce(current_setting('zono.outlet_write',true),'');
BEGIN
 IF NOT public.outlet_can_sell() THEN RAISE EXCEPTION 'Tu cuenta no puede cargar pedidos.'; END IF;
 IF p_operation IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Agregá productos al pedido.'; END IF;
 INSERT INTO public.outlet_operations(actor_id,operation_id) VALUES(actor,p_operation) ON CONFLICT DO NOTHING;
 SELECT x.result INTO v_result FROM public.outlet_operations x WHERE actor_id=actor AND operation_id=p_operation FOR UPDATE;
 IF v_result IS NOT NULL THEN RETURN v_result; END IF;
 IF p_order_id IS NULL AND coalesce(p_order->>'status','Pendiente') NOT IN ('Pendiente','En Espera') THEN RAISE EXCEPTION 'Estado inicial no válido.'; END IF;
 IF p_order_id IS NOT NULL THEN
  SELECT * INTO old_o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR (old_o.seller_id IS DISTINCT FROM actor AND NOT public.outlet_is_admin()) THEN RAISE EXCEPTION 'No podés modificar este pedido.'; END IF;
  IF old_o.status IN ('Entregado','Entregando','Cancelado','Anulado') OR EXISTS(SELECT 1 FROM public.outlet_assignments a JOIN public.outlet_units u ON u.id=a.unit_id WHERE a.order_id=p_order_id AND a.released_at IS NULL AND u.state<>'reserved') THEN RAISE EXCEPTION 'Este pedido requiere revisión antes de editar unidades.'; END IF;
 END IF;
 IF coalesce((p_order->>'seller_id')::uuid,actor)<>actor AND NOT public.outlet_is_admin() THEN RAISE EXCEPTION 'No podés cargar pedidos de otra vendedora.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sellers WHERE id=coalesce((p_order->>'seller_id')::uuid,actor) AND is_active AND (role IN ('admin','seller','vendedor') OR to_jsonb(roles) ?| ARRAY['admin','seller','vendedor'])) THEN RAISE EXCEPTION 'La vendedora seleccionada no está activa.'; END IF;
 IF coalesce(p_order->>'channel','')='mayorista' THEN RAISE EXCEPTION 'Las unidades únicas se venden por el circuito minorista.'; END IF;
 IF EXISTS(SELECT p.id FROM jsonb_array_elements(p_items) i JOIN public.products p ON p.id=(i->>'product_id')::uuid WHERE p.is_outlet_unit GROUP BY p.id HAVING count(*)>1) THEN RAISE EXCEPTION 'Una unidad no puede repetirse en el pedido.'; END IF;
 PERFORM 1 FROM public.outlet_units u WHERE u.product_id IN(SELECT (i->>'product_id')::uuid FROM jsonb_array_elements(p_items)i) OR u.id IN(SELECT unit_id FROM public.outlet_assignments WHERE order_id=p_order_id AND released_at IS NULL) ORDER BY u.id FOR UPDATE;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  IF (item->>'quantity')::int<=0 THEN RAISE EXCEPTION 'Revisá las cantidades.'; END IF;
  SELECT * INTO u FROM public.outlet_units WHERE product_id=(item->>'product_id')::uuid;
  IF FOUND THEN
   SELECT * INTO a FROM public.outlet_assignments WHERE unit_id=u.id AND released_at IS NULL;
   IF NOT (u.state='available' AND a.id IS NULL OR u.state='reserved' AND a.order_id=p_order_id) THEN RAISE EXCEPTION 'La unidad % ya no está disponible.',u.code; END IF;
   reference_price:=CASE WHEN a.order_id=p_order_id THEN (a.snapshot->>'list_price')::numeric ELSE public.outlet_effective_list(u) END;
   price:=CASE WHEN a.order_id=p_order_id THEN (a.snapshot->>'final_price')::numeric ELSE round(reference_price*(1-u.discount/100),2) END;
   quotes:=quotes||jsonb_build_object(u.id,jsonb_build_object('list_price',reference_price,'final_price',price));
   IF (item->>'quantity')::int<>1 OR (item->>'unit_price')::numeric IS DISTINCT FROM price OR coalesce((item->>'discount_percentage')::numeric,0)<>0 THEN RAISE EXCEPTION 'Revisá el precio o cantidad de la unidad %.',u.code; END IF;
  ELSE regular:=regular+(item->>'quantity')::int*(item->>'unit_price')::numeric;
  END IF;
  gross:=gross+(item->>'quantity')::int*(item->>'unit_price')::numeric;
 END LOOP;
 discount:=coalesce((p_order->>'order_discount_amount')::numeric,0);
 IF discount<0 OR discount>greatest(regular,0) OR regular<0 THEN RAISE EXCEPTION 'El descuento adicional solo puede aplicarse a productos normales.'; END IF;
 IF p_order->'totals' IS NULL THEN RAISE EXCEPTION 'Revisá los totales del pedido.'; END IF;
 expected:=greatest(0,gross-discount)+coalesce((p_order->'totals'->>'freight')::numeric,0)+coalesce((p_order->'totals'->>'tax')::numeric,0)+coalesce((p_order->'totals'->>'payment_surcharges')::numeric,0);
 IF (p_order->>'total_amount') IS NULL OR abs(expected-(p_order->>'total_amount')::numeric)>0.02 THEN RAISE EXCEPTION 'Los totales cambiaron. Revisá el pedido.'; END IF;
 PERFORM set_config('zono.outlet_write','on',true);
 -- Only known writable order columns are accepted; defaults are preserved on insert.
 rowdata:=p_order-ARRAY['id','created_at','created_by_id','payment_approved','invoice_status','invoice_url','cancel_reason'];
 rowdata:=rowdata||jsonb_build_object('created_by_id',coalesce(old_o.created_by_id,actor),'seller_id',coalesce(nullif(p_order->>'seller_id','')::uuid,actor));
 IF p_order_id IS NULL THEN
  SELECT string_agg(format('%I',c.column_name),','),string_agg(format('r.%I',c.column_name),',') INTO keys,vals FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='orders' AND rowdata ? c.column_name;
  EXECUTE format('INSERT INTO public.orders(%s) SELECT %s FROM jsonb_populate_record(NULL::public.orders,$1) r RETURNING *',keys,vals) INTO o USING rowdata;
 ELSE
  rowdata:=rowdata-ARRAY['status','legacy_code','source_visit_id','source_visit_quote_id','quote_id','created_by_id'];
  SELECT string_agg(format('%I=r.%I',c.column_name,c.column_name),',') INTO keys FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='orders' AND rowdata ? c.column_name;
  EXECUTE format('UPDATE public.orders o SET %s FROM jsonb_populate_record(NULL::public.orders,$1) r WHERE o.id=$2 RETURNING o.*',keys) INTO o USING rowdata,p_order_id;
  INSERT INTO public.inventory_transactions(product_id,quantity,type,reference_id,user_id) SELECT product_id,quantity,'Cancelacion Pedido',o.id,actor FROM public.order_items WHERE order_id=o.id;
  DELETE FROM public.order_items WHERE order_id=o.id;
  UPDATE public.deliveries SET delivery_date=o.initial_delivery_date WHERE order_id=o.id;
 END IF;
 -- Release only removed units; retained assignments keep their original price and snapshot.
 FOR a IN SELECT * FROM public.outlet_assignments WHERE order_id=o.id AND released_at IS NULL AND unit_id NOT IN(SELECT id FROM public.outlet_units WHERE product_id IN(SELECT (i->>'product_id')::uuid FROM jsonb_array_elements(p_items)i)) LOOP
  UPDATE public.outlet_assignments SET released_at=now() WHERE id=a.id;
  UPDATE public.outlet_units SET state='available' WHERE id=a.unit_id;
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO u FROM public.outlet_units WHERE product_id=(item->>'product_id')::uuid;
  snap:=NULL;
  IF FOUND THEN
   SELECT * INTO a FROM public.outlet_assignments WHERE unit_id=u.id AND released_at IS NULL AND order_id=o.id;
   IF FOUND THEN snap:=a.snapshot; ELSE
    snap:=jsonb_build_object('unit_id',u.id,'code',u.code,'condition',u.condition,'name',u.name,'reason',u.reason,'defect',u.defect,'photos',u.photos,'list_price',(quotes->(u.id::text))->'list_price','discount',u.discount,'final_price',(quotes->(u.id::text))->'final_price','version',u.version);
    INSERT INTO public.outlet_assignments(unit_id,order_id,snapshot) VALUES(u.id,o.id,snap);
    UPDATE public.outlet_units SET state='reserved' WHERE id=u.id;
   END IF;
  END IF;
  INSERT INTO public.order_items(order_id,product_id,product_name,quantity,unit_price,historical_unit_cost,discount_percentage,outlet_snapshot)
   VALUES(o.id,(item->>'product_id')::uuid,CASE WHEN snap IS NULL THEN item->>'product_name' ELSE (snap->>'name')||' · '||CASE snap->>'condition' WHEN 'segunda' THEN 'Segunda' ELSE 'Outlet' END||' ['||(snap->>'code')||'] · '||coalesce(snap->>'defect',snap->>'reason') END,(item->>'quantity')::int,(item->>'unit_price')::numeric,CASE WHEN snap IS NOT NULL THEN u.cost_price ELSE coalesce((item->>'historical_unit_cost')::numeric,0) END,coalesce((item->>'discount_percentage')::numeric,0),snap);
  INSERT INTO public.inventory_transactions(product_id,quantity,type,reference_id,user_id) VALUES((item->>'product_id')::uuid,(item->>'quantity')::int,'Reserva Pedido',o.id,actor);
 END LOOP;
 v_result:=jsonb_build_object('order',to_jsonb(o));
 UPDATE public.outlet_operations SET order_id=o.id,result=v_result WHERE actor_id=actor AND operation_id=p_operation;
 PERFORM set_config('zono.outlet_write',flag,true);
 RETURN v_result;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
