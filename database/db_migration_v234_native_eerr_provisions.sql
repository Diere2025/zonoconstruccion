begin;
create table public.eerr_monthly_provisions (
 month date primary key check(extract(day from month)=1),
 provisions jsonb not null default '{}'::jsonb check(jsonb_typeof(provisions)='object'),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
create table public.eerr_provision_events (
 id bigint generated always as identity primary key,
 month date not null, before_value jsonb, after_value jsonb not null,
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.eerr_monthly_provisions enable row level security;
alter table public.eerr_provision_events enable row level security;
revoke all on public.eerr_monthly_provisions,public.eerr_provision_events from public,anon,authenticated;
grant select on public.eerr_monthly_provisions,public.eerr_provision_events to service_role;
create or replace function public.save_eerr_provisions(p_actor uuid,p_month date,p_version integer,p_provisions jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous eerr_monthly_provisions; saved eerr_monthly_provisions; entry record; amount numeric;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<'2020-01-01' or p_month>date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'Mes inválido'; end if;
 if p_version is null or p_version<0 or jsonb_typeof(p_provisions) is distinct from 'object' then raise exception 'Precarga inválida'; end if;
 for entry in select * from jsonb_each(p_provisions) loop
  if entry.key<>all(array['Insumo de Producto','Insumo GLP','Publicidad','Publicidad (Fee)','IVA + IIBB','Costo Financiera','Alquileres','Sueldos','Honorarios','Servicio de Flete','Costos MercadoPago','Gastos Operativos','Vehículos','Eventuales','Gasto Peajes','Otros Ingresos y Egresos','Pérdida Extraordinaria','IIGG','Impuestos']) then raise exception 'Rubro inválido'; end if;
  if jsonb_typeof(entry.value->'amount') is distinct from 'number' or coalesce(entry.value->>'status','') not in ('estimated','confirmed') or jsonb_typeof(entry.value->'note') is distinct from 'string' or coalesce(length(trim(entry.value->>'note')),0) not between 1 and 500 then raise exception 'Importe, estado o fundamento inválido'; end if;
  amount:=(entry.value->>'amount')::numeric;
  if amount<0 or amount>1000000000000 or amount<>round(amount,2) then raise exception 'Importe inválido'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('eerr:'||p_month::text,0));
 select * into previous from eerr_monthly_provisions where month=p_month for update;
 if coalesce(previous.version,0)<>p_version then raise exception 'La precarga cambió. Recargá antes de guardar.' using errcode='40001'; end if;
 insert into eerr_monthly_provisions(month,provisions,version,updated_by) values(p_month,p_provisions,1,p_actor)
 on conflict(month) do update set provisions=excluded.provisions,version=eerr_monthly_provisions.version+1,updated_at=now(),updated_by=p_actor returning * into saved;
 insert into eerr_provision_events(month,before_value,after_value,actor_id) values(p_month,case when previous.month is not null then to_jsonb(previous) end,to_jsonb(saved),p_actor);
 return to_jsonb(saved);
end $$;
revoke all on function public.save_eerr_provisions(uuid,date,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_eerr_provisions(uuid,date,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
