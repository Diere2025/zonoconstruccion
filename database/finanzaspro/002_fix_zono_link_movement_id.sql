begin;
-- Qualify the movement identifier to avoid collisions with movimientos.id.
create or replace function public.review_zono_extraction(p_source uuid,p_revision bigint,p_action text,p_data jsonb,p_actor text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r zono_extraction_inbox;b cajas;m movimientos;ids uuid[]:='{}';v_movement_id uuid;amount numeric;day text;box text;category text;concept text;v_mode text;note text;item jsonb;
begin
 if p_actor is null or length(p_actor)<1 or length(p_actor)>256 then raise exception 'Sesión requerida';end if;
 select * into strict r from zono_extraction_inbox where source_id=p_source for update;
 if r.revision<>p_revision then raise exception 'La extracción cambió. Actualizá para revisarla.' using errcode='40001';end if;
 if r.state in('approved','linked','dismissed') and r.reviewed_revision=p_revision then return jsonb_build_object('success',true,'repeated',true,'state',r.state);end if;
 note:=left(coalesce(p_data->>'note',''),1000);
 if p_action='dismiss' then
  if length(btrim(note))<3 then raise exception 'Indicá el motivo para omitir o dar por revisado';end if;
  v_mode:='dismiss';
 elsif p_action='link' then
  if jsonb_typeof(p_data->'movement_ids') is distinct from 'array' or jsonb_array_length(p_data->'movement_ids') not between 1 and 20 then raise exception 'Seleccioná los movimientos existentes';end if;
  for item in select value from jsonb_array_elements(p_data->'movement_ids') loop
   v_movement_id:=(item#>>'{}')::uuid;select * into strict m from movimientos where movimientos.id=v_movement_id;
   if coalesce((select moneda from cajas where nombre=m.caja limit 1),'ARS')<>r.payload->>'currency' then raise exception 'La moneda del movimiento no coincide';end if;
   ids:=array_append(ids,v_movement_id);
  end loop;
  v_mode:='link';
 elsif p_action='approve' then
  if r.payload->>'active'<>'true' then raise exception 'La extracción fue anulada o dejó de corresponder a Diego';end if;
  if cardinality(r.linked_movements)>0 then raise exception 'Ya hay movimientos asociados: revisá la corrección sin volver a cargar dinero';end if;
  v_mode:=p_data->>'mode';if v_mode is null or v_mode not in('income','direct_payment') then raise exception 'Elegí ingreso o pago personal directo';end if;
  box:=p_data->>'box';select * into strict b from cajas where nombre=box;
  if b.moneda is distinct from r.payload->>'currency' then raise exception 'La moneda de la caja no coincide';end if;
  amount:=(r.payload->>'amount')::numeric;day:=r.payload->>'date';concept:=left(btrim(coalesce(p_data->>'concept','')),300);
  if concept='' then raise exception 'Completá el concepto';end if;
  category:=p_data->>'category';if v_mode='direct_payment' and not exists(select 1 from categorias where nombre=category) then raise exception 'Seleccioná una categoría del gasto';end if;
  -- Lock source across the complete decision and use stable keys for retries.
  insert into movimientos(firebase_id,fecha,categoria,caja,concepto,tipo,monto,fecha_importacion)
   values('zono:'||p_source::text||':income',day,'Extracción Zono',box,'Extracción Zono · '||concept,'Crédito',amount,now()) returning movimientos.id into v_movement_id;
  ids:=array_append(ids,v_movement_id);
  if v_mode='direct_payment' then
   insert into movimientos(firebase_id,fecha,categoria,caja,concepto,tipo,monto,fecha_importacion)
    values('zono:'||p_source::text||':expense',day,category,box,concept,'Débito',amount,now()) returning movimientos.id into v_movement_id;
   ids:=array_append(ids,v_movement_id);
  end if;
 else raise exception 'Acción inválida';end if;
 update zono_extraction_inbox set state=case when p_action='approve' then 'approved' when p_action='link' then 'linked' else 'dismissed' end,
  mode=v_mode,linked_movements=case when p_action='dismiss' then linked_movements else ids end,review_note=note,reviewed_revision=revision,reviewed_at=now(),updated_at=now() where source_id=p_source;
 insert into zono_extraction_inbox_events(source_id,action,revision,actor,before_value,after_value) values(p_source,p_action,p_revision,p_actor,to_jsonb(r),(select to_jsonb(x) from zono_extraction_inbox x where source_id=p_source));
 return jsonb_build_object('success',true,'state',(select state from zono_extraction_inbox where source_id=p_source),'movement_ids',ids);
end $$;
notify pgrst,'reload schema';
commit;
