begin;
-- Descriptive references are optional; motives, amounts and accounting links remain required.
alter table public.logistics_freight_novelties drop constraint if exists logistics_freight_novelties_reference_check;
alter table public.logistics_freight_novelties add constraint logistics_freight_novelties_reference_check check(length(trim(reference)) <= 500);
create or replace function public.save_logistics_freight_settlement_terms(p_actor uuid,p_dispatch uuid,p_version integer,p_terms jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous logistics_freight_settlement_terms%rowtype; gross numeric; net numeric; deducted numeric; saved logistics_freight_settlement_terms%rowtype;
begin
 if not coalesce(public.can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 if not exists(select 1 from logistics_dispatch_plans where dispatch_id=p_dispatch and status='completed') then raise exception 'La salida debe estar cerrada';end if;
 select * into previous from logistics_freight_settlement_terms where dispatch_id=p_dispatch for update;
 if coalesce(p_terms->'extraSnapshot','[]'::jsonb) is distinct from (select coalesce(actual->'extras','[]'::jsonb) from logistics_dispatch_plans where dispatch_id=p_dispatch) then raise exception 'Los extras cambiaron. Actualizá.' using errcode='40001';end if;
 if coalesce(previous.version,0) is distinct from p_version then raise exception 'El saldo cambió. Actualizá.' using errcode='40001';end if;
 gross=(p_terms->>'grossAmount')::numeric;net=(p_terms->>'netAmount')::numeric;
 if gross is null or net is null or gross<=0 or gross>100000000 or gross<>round(gross,2) or net<>round(net,2)
  or jsonb_typeof(p_terms->'deductions') is distinct from 'array' or jsonb_array_length(p_terms->'deductions')>30
  or length(trim(coalesce(p_terms->>'evidence',''))) not between 1 and 2000 then raise exception 'Importe o evidencia inválidos';end if;
 if exists(select 1 from jsonb_array_elements(p_terms->'deductions') d where
  length(trim(coalesce(d->>'label',''))) not between 1 and 300 or length(trim(coalesce(d->>'reference',''))) > 500
  or coalesce(d->>'kind','') not in ('discount','offset') or (d->>'amount') is null
  or (d->>'amount')::numeric<=0 or (d->>'amount')::numeric<>round((d->>'amount')::numeric,2)) then raise exception 'Descuento inválido';end if;
 select coalesce(sum((d->>'amount')::numeric),0) into deducted from jsonb_array_elements(p_terms->'deductions') d;
 if deducted>gross or net is distinct from gross-deducted then raise exception 'El neto no coincide';end if;
 insert into logistics_freight_settlement_terms(dispatch_id,gross_amount,net_amount,deductions,extra_snapshot,evidence,version,confirmed_by)
 values(p_dispatch,gross,net,p_terms->'deductions',coalesce(p_terms->'extraSnapshot','[]'::jsonb),p_terms->>'evidence',p_version+1,p_actor)
 on conflict(dispatch_id) do update set gross_amount=excluded.gross_amount,net_amount=excluded.net_amount,deductions=excluded.deductions,extra_snapshot=excluded.extra_snapshot,evidence=excluded.evidence,version=excluded.version,confirmed_by=excluded.confirmed_by,updated_at=now()
 returning * into saved;
 insert into logistics_freight_accounting_events(actor_id,dispatch_id,kind,previous_data,new_data) values(p_actor,p_dispatch,'settlement_terms',case when previous.dispatch_id is null then null else to_jsonb(previous) end,to_jsonb(saved));
 return to_jsonb(saved);
end;$$;
create or replace function public.save_logistics_dispatch_extras(p_actor uuid,p_dispatch uuid,p_version integer,p_extras jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous logistics_dispatch_plans%rowtype; saved logistics_dispatch_plans%rowtype; e jsonb; amount numeric;
begin
 if not coalesce(public.can_plan_logistics(p_actor),false) then raise exception 'Sin permiso para registrar extras de logística' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into previous from logistics_dispatch_plans where dispatch_id=p_dispatch for update;
 if not found or previous.status='cancelled' then raise exception 'Salida inexistente o no realizada';end if;
 if previous.version is distinct from p_version then raise exception 'La salida cambió. Actualizá.' using errcode='40001';end if;
 if jsonb_typeof(p_extras) is distinct from 'array' or jsonb_array_length(p_extras)>20 then raise exception 'Extras inválidos';end if;
 if (select count(distinct j->>'id') from jsonb_array_elements(p_extras) j)<>jsonb_array_length(p_extras) then raise exception 'Extra repetido';end if;
 for e in select value from jsonb_array_elements(p_extras) loop
  if coalesce(e->>'id','')!~'^[0-9a-fA-F-]{36}$' or coalesce(e->>'kind','') not in ('pickup','errand','parcel','waiting','km_adjustment','other')
   or length(trim(coalesce(e->>'label',''))) not between 1 and 300 or length(trim(coalesce(e->>'reference',''))) > 500 then raise exception 'Cada extra requiere tipo y motivo válidos';end if;
  amount=(e->>'amount')::numeric;
  if amount is null or amount<=0 or amount>100000000 or amount<>round(amount,2) then raise exception 'Importe inválido';end if;
  if e->>'kind'='km_adjustment' and (coalesce((e->>'km')::numeric,0)<=0 or coalesce((e->>'unitPrice')::numeric,0)<=0 or amount is distinct from round((e->>'km')::numeric*(e->>'unitPrice')::numeric,2)) then raise exception 'El ajuste no coincide con km por tarifa';end if;
  if e->>'runNumber' is not null and not exists(select 1 from jsonb_array_elements(previous.planned->'loads') l where l->>'runNumber'=e->>'runNumber') then raise exception 'La carga no pertenece al LOG';end if;
 end loop;
 update logistics_dispatch_plans set actual=jsonb_set(actual,'{extras}',p_extras),version=version+1,updated_by=p_actor,updated_at=now() where dispatch_id=p_dispatch returning * into saved;
 insert into logistics_dispatch_plan_events(dispatch_id,actor_id,previous_version,data) values(p_dispatch,p_actor,previous.version,jsonb_build_object('action','service_extras','previousExtras',coalesce(previous.actual->'extras','[]'::jsonb),'extras',p_extras,'version',saved.version));
 return jsonb_build_object('dispatchId',p_dispatch,'version',saved.version);
end;$$;
create or replace function public.save_logistics_freight_novelty(p_actor uuid,p_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n logistics_freight_novelties; saved logistics_freight_novelties;
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into n from logistics_freight_novelties where id=p_id for update;
 if found then
  if (to_jsonb(n)-'id'-'status'-'created_by'-'created_at')=p_input then return to_jsonb(n);end if;
  raise exception 'La novedad ya existe con otros datos' using errcode='23505';
 end if;
 if nullif(p_input->>'amount','') is null or (p_input->>'amount')::numeric<>round((p_input->>'amount')::numeric,2) then raise exception 'Importe inválido';end if;
 insert into logistics_freight_novelties(id,carrier_id,company_key,origin_date,source_dispatch_id,kind,label,reference,amount,created_by)
 values(p_id,(p_input->>'carrier_id')::uuid,p_input->>'company_key',(p_input->>'origin_date')::date,(p_input->>'source_dispatch_id')::uuid,p_input->>'kind',p_input->>'label',coalesce(p_input->>'reference',''),(p_input->>'amount')::numeric,p_actor) returning * into saved;
 insert into logistics_freight_accounting_events(actor_id,kind,new_data) values(p_actor,'novelty_created',to_jsonb(saved));
 return to_jsonb(saved);
end$$;
commit;
