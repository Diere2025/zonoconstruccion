BEGIN;
ALTER TABLE public.outlet_units ADD COLUMN IF NOT EXISTS base_stock_transferred boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.outlet_save_unit(p_id uuid,p_version integer,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE u public.outlet_units; target text; price numeric; pid uuid; flag text:=coalesce(current_setting('zono.outlet_write',true),'');
BEGIN
 IF NOT public.outlet_is_admin() THEN RAISE EXCEPTION 'Solo administración puede modificar unidades.'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO u FROM public.outlet_units WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR u.version<>p_version THEN RAISE EXCEPTION 'La ficha cambió. Actualizala antes de guardar.'; END IF;
  IF u.state IN ('reserved','sold') THEN RAISE EXCEPTION 'La unidad está vinculada a una venta. Revisá el pedido.'; END IF;
 ELSE u.id:=gen_random_uuid(); u.code:='OUT-'||upper(substr(u.id::text,1,8)); u.state:='draft'; u.version:=1; END IF;
 target:=coalesce(p_data->>'state','draft');
 IF target NOT IN ('draft','available','withdrawn','review') THEN RAISE EXCEPTION 'Estado no válido.'; END IF;
 IF target='available' AND EXISTS(SELECT 1 FROM public.outlet_assignments WHERE unit_id=u.id AND released_at IS NULL) THEN RAISE EXCEPTION 'Cancelá el pedido original antes de publicar la devolución.'; END IF;
 IF (u.state='review' OR u.physical_present IS FALSE) AND target='available' AND coalesce(p_data->>'return_reason','')='' THEN RAISE EXCEPTION 'Confirmá la revisión física antes de volver a publicar.'; END IF;
 u.code:=coalesce(nullif(trim(p_data->>'code'),''),u.code);u.name:=coalesce(p_data->>'name','');u.category:=coalesce(p_data->>'category','');
 u.condition:=p_data->>'condition';u.base_product_id:=nullif(p_data->>'base_product_id','')::uuid;u.reason:=coalesce(p_data->>'reason','');
 u.defect:=coalesce(p_data->>'defect','');u.location:=coalesce(p_data->>'location','');u.attributes:=coalesce(p_data->'attributes','{}');
 u.list_price:=nullif(p_data->>'list_price','')::numeric;u.discount:=nullif(p_data->>'discount','')::numeric;
 u.cost_price:=nullif(p_data->>'cost_price','')::numeric;u.price_mode:=coalesce(p_data->>'price_mode','manual');u.photos:=coalesce(p_data->'photos','[]');
 IF (u.state='review' OR u.physical_present IS FALSE) AND target='available' THEN u.physical_present:=true;u.attributes:=u.attributes||jsonb_build_object('return_review',p_data->>'return_reason'); END IF;
 IF u.base_product_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.products WHERE id=u.base_product_id AND is_outlet_unit) THEN RAISE EXCEPTION 'Elegí un modelo de referencia normal.'; END IF;
 price:=public.outlet_effective_list(u);
 IF target='available' AND (trim(u.name)='' OR trim(u.category)='' OR trim(u.reason)='' OR price IS NULL OR price<=0 OR u.discount IS NULL OR jsonb_array_length(u.photos)=0) THEN RAISE EXCEPTION 'Completá nombre, categoría, motivo, fotos, precio de lista y descuento antes de publicar.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(u.photos) p WHERE p !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='outlet-images' AND o.name=p)) THEN RAISE EXCEPTION 'Revisá las fotos de la unidad.'; END IF;
 IF target='available' AND u.product_id IS NULL AND coalesce((p_data->>'take_from_base_stock')::boolean,false) THEN
  PERFORM 1 FROM public.products WHERE id=u.base_product_id AND NOT is_outlet_unit AND NOT is_service AND NOT coalesce(is_generic,false) AND stock_current>=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto base no tiene una unidad disponible para reclasificar.'; END IF;
  INSERT INTO public.inventory_transactions(product_id,quantity,type,reference_id,user_id) VALUES(u.base_product_id,-1,'Ajuste',u.id,auth.uid());
  u.base_stock_transferred:=true;
 END IF;
 IF target='available' AND u.product_id IS NULL THEN
  PERFORM set_config('zono.outlet_write','on',true);
  INSERT INTO public.products(name,price,category,is_active,is_outlet_unit,fixed_price) VALUES(u.name||' · '||CASE u.condition WHEN 'segunda' THEN 'Segunda' ELSE 'Outlet' END||' ['||u.code||']',0,u.category,false,true,true) RETURNING id INTO pid;
  u.product_id:=pid;
  PERFORM set_config('zono.outlet_write',flag,true);
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.outlet_units(id,code,condition,name,category,base_product_id,reason,defect,location,attributes,list_price,discount,cost_price,price_mode,photos,state,product_id,base_stock_transferred)
   VALUES(u.id,u.code,u.condition,u.name,u.category,u.base_product_id,u.reason,u.defect,u.location,u.attributes,u.list_price,u.discount,u.cost_price,u.price_mode,u.photos,target,u.product_id,coalesce(u.base_stock_transferred,false));
 ELSE
  UPDATE public.outlet_units SET code=u.code,condition=u.condition,name=u.name,category=u.category,base_product_id=u.base_product_id,reason=u.reason,defect=u.defect,location=u.location,attributes=u.attributes,list_price=u.list_price,discount=u.discount,cost_price=u.cost_price,price_mode=u.price_mode,photos=u.photos,state=target,product_id=u.product_id,physical_present=coalesce(u.physical_present,true),base_stock_transferred=coalesce(u.base_stock_transferred,false) WHERE id=u.id;
 END IF;
 RETURN u.id;
END; $$;
COMMIT;
