begin;
create table if not exists public.zono_extraction_inbox(
 source_id uuid primary key,revision bigint not null,payload jsonb not null,previous_payload jsonb,
 state text not null default 'pending' check(state in('pending','approved','linked','dismissed','review')),
 reviewed_revision bigint,mode text,linked_movements uuid[] not null default '{}',review_note text,
 first_seen_at timestamptz not null default now(),updated_at timestamptz not null default now(),reviewed_at timestamptz
);
create table if not exists public.zono_extraction_inbox_events(
 id bigint generated always as identity primary key,source_id uuid not null,action text not null,revision bigint not null,
 actor text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
alter table zono_extraction_inbox enable row level security;alter table zono_extraction_inbox_events enable row level security;
revoke all on zono_extraction_inbox,zono_extraction_inbox_events from public,anon,authenticated;
grant all on zono_extraction_inbox,zono_extraction_inbox_events to service_role;
grant usage,select on sequence zono_extraction_inbox_events_id_seq to service_role;
create or replace function public.receive_zono_extraction(p_source uuid,p_revision bigint,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old zono_extraction_inbox;
begin
 if p_source is null or p_revision is null or p_revision<1 or jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'transaction_id' is distinct from p_source::text
  or p_payload->>'person' is distinct from 'Diego Bóveda' or coalesce(p_payload->>'kind','') not in('extraction','reserve_funding')
  or coalesce(p_payload->>'date','')!~ '^\d{4}-\d{2}-\d{2}$' or (p_payload->>'date')::date<'2026-10-01' or coalesce((p_payload->>'amount')::numeric,0)<=0
  or coalesce(p_payload->>'currency','') not in('ARS','USD','EUR') or jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'Extracción inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended('zono_source:'||p_source::text,0));
 select * into old from zono_extraction_inbox where source_id=p_source for update;
 if found and old.revision>=p_revision then return jsonb_build_object('success',true,'repeated',true,'revision',old.revision);end if;
 insert into zono_extraction_inbox(source_id,revision,payload) values(p_source,p_revision,p_payload)
 on conflict(source_id) do update set previous_payload=zono_extraction_inbox.payload,payload=excluded.payload,revision=excluded.revision,
  state=case when zono_extraction_inbox.reviewed_revision is not null then 'review' else 'pending' end,updated_at=now();
 insert into zono_extraction_inbox_events(source_id,action,revision,actor,before_value,after_value) values(p_source,case when old.source_id is null then 'received' else 'source.changed' end,p_revision,'zono',to_jsonb(old),p_payload);
 return jsonb_build_object('success',true,'revision',p_revision,'financialWrites',0);
end $$;

create or replace function public.review_zono_extraction(p_source uuid,p_revision bigint,p_action text,p_data jsonb,p_actor text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r zono_extraction_inbox;b cajas;m movimientos;ids uuid[]:='{}';id uuid;amount numeric;day text;box text;category text;concept text;v_mode text;note text;item jsonb;
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
   id:=(item#>>'{}')::uuid;select * into strict m from movimientos where movimientos.id=id;
   if coalesce((select moneda from cajas where nombre=m.caja limit 1),'ARS')<>r.payload->>'currency' then raise exception 'La moneda del movimiento no coincide';end if;
   ids:=array_append(ids,id);
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
   values('zono:'||p_source::text||':income',day,'Extracción Zono',box,'Extracción Zono · '||concept,'Crédito',amount,now()) returning movimientos.id into id;
  ids:=array_append(ids,id);
  if v_mode='direct_payment' then
   insert into movimientos(firebase_id,fecha,categoria,caja,concepto,tipo,monto,fecha_importacion)
    values('zono:'||p_source::text||':expense',day,category,box,concept,'Débito',amount,now()) returning movimientos.id into id;
   ids:=array_append(ids,id);
  end if;
 else raise exception 'Acción inválida';end if;
 update zono_extraction_inbox set state=case when p_action='approve' then 'approved' when p_action='link' then 'linked' else 'dismissed' end,
  mode=v_mode,linked_movements=case when p_action='dismiss' then linked_movements else ids end,review_note=note,reviewed_revision=revision,reviewed_at=now(),updated_at=now() where source_id=p_source;
 insert into zono_extraction_inbox_events(source_id,action,revision,actor,before_value,after_value) values(p_source,p_action,p_revision,p_actor,to_jsonb(r),(select to_jsonb(x) from zono_extraction_inbox x where source_id=p_source));
 return jsonb_build_object('success',true,'state',(select state from zono_extraction_inbox where source_id=p_source),'movement_ids',ids);
end $$;
revoke all on function receive_zono_extraction(uuid,bigint,jsonb),review_zono_extraction(uuid,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function receive_zono_extraction(uuid,bigint,jsonb),review_zono_extraction(uuid,bigint,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
