-- Composition only: the account start remains the sole opening ledger entry.
begin;
alter table public.supplier_account_starts add column opening_detail_version bigint not null default 0;
create table public.supplier_opening_items (
 supplier_id uuid not null references supplier_account_starts(supplier_id) on delete restrict,
 number integer not null check(number between 1 and 500),
 reference text not null check(length(trim(reference)) between 1 and 200),
 currency text not null check(currency in ('ARS','USD')),
 amount numeric(15,2) not null check(amount<>0 and abs(amount)<1000000000000),
 document_condition text not null check(document_condition in ('facturado','por_remito','sin_detalle')),
 document_date date,due_date date,evidence text not null check(length(trim(evidence)) between 3 and 2000),
 primary key(supplier_id,number)
);
create table public.supplier_opening_events (
 id uuid primary key default gen_random_uuid(),supplier_id uuid not null references suppliers(id),
 actor_id uuid not null references auth.users(id),request_id uuid not null,payload jsonb not null,
 before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table public.supplier_opening_items enable row level security;
alter table public.supplier_opening_events enable row level security;
revoke all on public.supplier_opening_items,public.supplier_opening_events from public,anon,authenticated;
grant all on public.supplier_opening_items to service_role;
grant select,insert on public.supplier_opening_events to service_role;

create function public.supplier_opening_signature(p_supplier uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(to_jsonb(s)::text||coalesce((select jsonb_agg(to_jsonb(i) order by number)::text from supplier_opening_items i where i.supplier_id=s.supplier_id),'[]'))
 from supplier_account_starts s where s.supplier_id=p_supplier
$$;
create function public.get_supplier_opening_detail(p_supplier uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('start',to_jsonb(s),'signature',supplier_opening_signature(p_supplier),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by number) from supplier_opening_items i where i.supplier_id=p_supplier),'[]'),
 'events',coalesce((select jsonb_agg(e order by e.created_at desc,e.id desc) from
 (select id,reason,created_at,actor_id from
  (select id,payload->>'reason' reason,created_at,actor_id from supplier_opening_events where supplier_id=p_supplier order by created_at desc,id desc limit 25) a) e),'[]'))
 from supplier_account_starts s where s.supplier_id=p_supplier
$$;

create function public.guard_supplier_opening_header() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 if exists(select 1 from supplier_opening_items where supplier_id=old.supplier_id) then
  if tg_op='DELETE' then raise exception 'Quitá el desglose de apertura antes de borrar el punto de partida.'; end if;
  if new.supplier_id<>old.supplier_id or new.start_date<>old.start_date or new.opening_ars<>old.opening_ars or new.opening_usd<>old.opening_usd then
   raise exception 'Quitá el desglose de apertura antes de cambiar su fecha o sus saldos. Después reconstruí el detalle con los nuevos totales.';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger supplier_opening_header_guard before update or delete on public.supplier_account_starts
for each row execute function public.guard_supplier_opening_header();

create function public.save_supplier_opening_detail(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supplier_account_starts; prior public.supplier_opening_events; i jsonb; value numeric;
 ars numeric:=0;usd numeric:=0;n integer:=0;before_value jsonb;result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para detallar la apertura.' using errcode='42501'; end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000
  or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>500 then raise exception 'Desglose de apertura inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':supplier-opening:'||p_request::text,0));
 select * into prior from supplier_opening_events where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505'; end if;
  return prior.after_value;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
 select * into strict s from supplier_account_starts where supplier_id=(p_payload->>'supplierId')::uuid for update;
 if supplier_opening_signature(s.supplier_id) is distinct from p_payload->>'signature' then raise exception 'La apertura cambió. Actualizá la vista.' using errcode='40001'; end if;
 before_value:=jsonb_build_object('start',to_jsonb(s),'items',coalesce((select jsonb_agg(to_jsonb(x) order by number) from supplier_opening_items x where x.supplier_id=s.supplier_id),'[]'));
 for i in select x from jsonb_array_elements(p_payload->'items') x loop
  value:=(i->>'amount')::numeric;
  if value is null or value=0 or value<>round(value,2) or abs(value)>=1000000000000
   or length(trim(coalesce(i->>'reference',''))) not between 1 and 200
   or length(trim(coalesce(i->>'evidence',''))) not between 3 and 2000
   or coalesce(i->>'currency','') not in ('ARS','USD')
   or coalesce(i->>'condition','') not in ('facturado','por_remito','sin_detalle') then raise exception 'Cada partida requiere referencia, moneda, importe con centavos y respaldo.'; end if;
  if nullif(i->>'documentDate','')::date>s.start_date then raise exception 'La fecha del documento no puede ser posterior a la apertura.'; end if;
  -- Force parsing before deletion, including optional future due dates.
  perform nullif(i->>'dueDate','')::date;
  if i->>'currency'='ARS' then ars:=ars+value;else usd:=usd+value;end if;
 end loop;
 if jsonb_array_length(p_payload->'items')>0 and (ars<>s.opening_ars or usd<>s.opening_usd) then raise exception 'El desglose debe sumar exactamente el saldo inicial de cada moneda.'; end if;
 delete from supplier_opening_items where supplier_id=s.supplier_id;
 for i in select x from jsonb_array_elements(p_payload->'items') x loop
  n:=n+1;insert into supplier_opening_items values(s.supplier_id,n,trim(i->>'reference'),i->>'currency',(i->>'amount')::numeric,i->>'condition',nullif(i->>'documentDate','')::date,nullif(i->>'dueDate','')::date,trim(i->>'evidence'));
 end loop;
 update supplier_account_starts set opening_detail_version=opening_detail_version+1,updated_by=p_actor,updated_at=clock_timestamp() where supplier_id=s.supplier_id;
 result:=jsonb_build_object('supplierId',s.supplier_id,'signature',supplier_opening_signature(s.supplier_id),'items',coalesce((select jsonb_agg(to_jsonb(x) order by number) from supplier_opening_items x where x.supplier_id=s.supplier_id),'[]'));
 insert into supplier_opening_events(supplier_id,actor_id,request_id,payload,before_value,after_value) values(s.supplier_id,p_actor,p_request,p_payload,before_value,result);
 return result;
end $$;
revoke all on function public.supplier_opening_signature(uuid),public.get_supplier_opening_detail(uuid),public.guard_supplier_opening_header(),public.save_supplier_opening_detail(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.supplier_opening_signature(uuid),public.get_supplier_opening_detail(uuid),public.guard_supplier_opening_header(),public.save_supplier_opening_detail(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
