begin;
create table if not exists public.treasury_settlement_shortage_links (
 settlement_id uuid primary key references public.treasury_settlements(id),
 novelty_id uuid not null unique references public.logistics_freight_novelties(id),
 created_by uuid not null, created_at timestamptz not null default now()
);
alter table public.treasury_settlement_shortage_links enable row level security;
revoke all on public.treasury_settlement_shortage_links from public,anon,authenticated;
grant all on public.treasury_settlement_shortage_links to service_role;

create or replace function public.treasury_shortage_dispatch(p_settlement uuid) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ids uuid[];
begin
 select array_agg(distinct dispatch_id) into ids from (
  select dispatch_id from logistics_dispatch_settlements where settlement_id=p_settlement
  union select r.dispatch_id from logistics_dispatch_routes r join treasury_settlements s on s.route_sheet_id=r.route_sheet_id where s.id=p_settlement
 ) linked;
 if cardinality(ids)=1 then return ids[1];end if;
 return null;
end $$;

create or replace function public.treasury_shortage_covered(p_settlement uuid,p_difference numeric) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from treasury_settlement_shortage_links l
 join treasury_settlements s on s.id=l.settlement_id
 join logistics_freight_novelties n on n.id=l.novelty_id
 where l.settlement_id=p_settlement and n.status='approved' and n.kind='shortage'
 and n.amount>=abs(p_difference) and n.source_dispatch_id=treasury_shortage_dispatch(p_settlement)
 and case when logistics_company_for_carrier(s.carrier_id) is null then n.carrier_id=s.carrier_id
 else n.company_key=logistics_company_for_carrier(s.carrier_id) end);
$$;

create or replace function public.treasury_settlement_shortage_status(p_actor uuid,p_settlement uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s treasury_settlements; d logistics_dispatches; n logistics_freight_novelties;
begin
 if not coalesce(can_manage_treasury_settlements(p_actor),false) then raise exception 'Sin permiso para gestionar rendiciones.' using errcode='42501';end if;
 select * into strict s from treasury_settlements where id=p_settlement;
 select * into d from logistics_dispatches where id=treasury_shortage_dispatch(s.id);
 select v.* into n from logistics_freight_novelties v join treasury_settlement_shortage_links l on l.novelty_id=v.id where l.settlement_id=s.id;
 return jsonb_build_object('settlementId',s.id,'settlementCode',s.code,'difference',s.difference,
 'required',s.difference<=-500,'covered',treasury_shortage_covered(s.id,s.difference),
 'carrierName',s.carrier_name,'originDate',s.settlement_date,'dispatchId',d.id,'dispatchCode',d.code,
 'amount',greatest(0,-coalesce(s.difference,0)),'noveltyId',n.id,'noveltyAmount',n.amount,
 'reference','Faltante '||s.code||coalesce(' - '||d.code,''));
end $$;

create or replace function public.register_treasury_settlement_shortage(p_actor uuid,p_settlement uuid,p_key uuid,p_difference numeric) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s treasury_settlements; d logistics_dispatches; company text; n logistics_freight_novelties; saved jsonb; candidates uuid[];
begin
 if not coalesce(can_manage_treasury_settlements(p_actor),false) or not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería.' using errcode='42501';end if;
 -- Match the existing freight workflow lock order.
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into strict s from treasury_settlements where id=p_settlement for update;
 if s.status='archived' then raise exception 'La rendición está archivada.';end if;
 if p_key is null or p_difference is distinct from s.difference or coalesce(s.difference,0)>=0 then raise exception 'El faltante cambió. Guardá y volvé a revisar la rendición.' using errcode='40001';end if;
 select * into d from logistics_dispatches where id=treasury_shortage_dispatch(s.id);
 if d.id is null then raise exception 'Vinculá la rendición a un único LOG antes de registrar la novedad.';end if;
 select v.* into n from logistics_freight_novelties v join treasury_settlement_shortage_links l on l.novelty_id=v.id where l.settlement_id=s.id for update of v;
 if found and n.status='approved' then
  if treasury_shortage_covered(s.id,s.difference) then return treasury_settlement_shortage_status(p_actor,s.id);end if;
  raise exception 'Ya hay una novedad de esta rendición con otro importe o responsable. Revisala en Novedades antes de continuar.';
 end if;
 company=logistics_company_for_carrier(s.carrier_id);
 -- Adopt an unambiguous manually registered novelty rather than charge twice.
 select array_agg(id) into candidates from logistics_freight_novelties
 where source_dispatch_id=d.id and kind='shortage' and status='approved' and strpos(reference,s.code)>0;
 if coalesce(cardinality(candidates),0)>0 then
  if cardinality(candidates)<>1 then raise exception 'Hay varias novedades que mencionan esta rendición. Revisalas antes de registrar otra.';end if;
  select * into n from logistics_freight_novelties where id=candidates[1] for update;
  if n.reference is distinct from 'Faltante '||s.code||' - '||d.code or n.amount<>abs(s.difference)
   or (company is null and n.carrier_id is distinct from s.carrier_id)
   or (company is not null and n.company_key is distinct from company) then
   raise exception 'Ya existe una novedad que menciona esta rendición con datos distintos. Revisala antes de registrar otra.';
  end if;
  insert into treasury_settlement_shortage_links(settlement_id,novelty_id,created_by) values(s.id,n.id,p_actor)
  on conflict(settlement_id) do update set novelty_id=excluded.novelty_id,created_by=excluded.created_by,created_at=now();
  return treasury_settlement_shortage_status(p_actor,s.id);
 end if;
 saved=save_logistics_freight_novelty(p_actor,p_key,jsonb_build_object(
 'carrier_id',case when company is null then s.carrier_id else null end,'company_key',company,
 'origin_date',s.settlement_date,'source_dispatch_id',d.id,'kind','shortage',
 'label','Faltante de rendición','reference','Faltante '||s.code||' - '||d.code,'amount',abs(s.difference)));
 insert into treasury_settlement_shortage_links(settlement_id,novelty_id,created_by) values(s.id,(saved->>'id')::uuid,p_actor)
 on conflict(settlement_id) do update set novelty_id=excluded.novelty_id,created_by=excluded.created_by,created_at=now();
 return treasury_settlement_shortage_status(p_actor,s.id);
end $$;

create or replace function public.guard_treasury_settlement_shortage() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(new.difference,0)<=-500 and (new.status='confirmed' or
  (tg_op='UPDATE' and new.movements_generated_at is distinct from old.movements_generated_at and new.movements_generated_at is not null))
 and not treasury_shortage_covered(new.id,new.difference) then
  raise exception 'Para cerrar la rendición y generar en caja, debés registrar la novedad por el faltante pendiente (monto mayor o igual a $500).';
 end if;
 return new;
end $$;
drop trigger if exists treasury_settlement_shortage_guard on public.treasury_settlements;
create trigger treasury_settlement_shortage_guard before insert or update of status,difference,movements_generated_at on public.treasury_settlements
 for each row execute function public.guard_treasury_settlement_shortage();
revoke all on function public.treasury_shortage_dispatch(uuid),public.treasury_shortage_covered(uuid,numeric),public.guard_treasury_settlement_shortage(),public.treasury_settlement_shortage_status(uuid,uuid),public.register_treasury_settlement_shortage(uuid,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.treasury_settlement_shortage_status(uuid,uuid),public.register_treasury_settlement_shortage(uuid,uuid,uuid,numeric) to service_role;
notify pgrst,'reload schema';
commit;
