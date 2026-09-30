-- Payment planning keeps forecasts separate from actual treasury movements.
begin;

create table if not exists public.payment_planning_funds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  kind text not null check (kind in ('cash','personal','company','other')),
  currency text not null check (currency in ('ARS','USD')),
  scenario text not null default 'intermedio' check (scenario in ('optimista','intermedio','pesimista')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind,currency)
);
insert into public.payment_planning_funds(name,kind,currency,scenario) values
  ('Efectivo','cash','ARS','intermedio'),
  ('Cuentas personales','personal','ARS','intermedio'),
  ('Cuentas ZONO','company','ARS','pesimista')
on conflict (kind,currency) do nothing;

create table if not exists public.payment_planning_balances (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.payment_planning_funds(id),
  effective_date date not null,
  amount numeric(15,2) not null,
  reserved_amount numeric(15,2) not null default 0 check (reserved_amount >= 0),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (fund_id,effective_date)
);

create table if not exists public.payment_planning_recurrences (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.payment_planning_funds(id),
  kind text not null check (kind in ('income','expense')),
  title text not null check (length(trim(title)) between 2 and 240),
  amount numeric(15,2) not null check (amount >= 0),
  cadence text not null check (cadence in ('daily','weekly','monthly')),
  weekdays integer[] not null default '{1,2,3,4,5,6,7}',
  month_day integer check (month_day between 1 and 31),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (cadence <> 'monthly' or month_day is not null),
  check (weekdays <@ array[1,2,3,4,5,6,7] and cardinality(weekdays) > 0)
);

create table if not exists public.payment_planning_items (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.payment_planning_funds(id),
  kind text not null check (kind in ('income','expense')),
  title text not null check (length(trim(title)) between 2 and 240),
  amount numeric(15,2) check (amount >= 0),
  closed_amount numeric(15,2) not null default 0 check (closed_amount >= 0),
  scheduled_date date,
  due_date date,
  status text not null default 'active' check (status in ('draft','active','cancelled')),
  priority text not null default 'normal' check (priority in ('normal','high')),
  notes text not null default '',
  source text not null default 'manual' check (source in ('manual','scenario','recurrence','import')),
  is_adjustment boolean not null default false,
  installment_group_id uuid,
  installment_number integer,
  installment_count integer,
  scenario_rule_id uuid,
  recurrence_id uuid references public.payment_planning_recurrences(id),
  occurrence_date date,
  import_source_key text unique,
  supplier_id uuid references public.suppliers(id),
  employee_id uuid references public.employees(id),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recurrence_id,occurrence_date),
  check ((installment_group_id is null and installment_number is null and installment_count is null)
    or (installment_group_id is not null and installment_number between 1 and installment_count and installment_count between 2 and 60)),
  check (amount is null or closed_amount <= amount)
);
create index if not exists payment_planning_items_fund_date_idx on public.payment_planning_items(fund_id,scheduled_date,id);
create index if not exists payment_planning_items_status_date_idx on public.payment_planning_items(status,scheduled_date,id);

create table if not exists public.payment_planning_realizations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.payment_planning_items(id),
  fund_id uuid not null references public.payment_planning_funds(id),
  amount numeric(15,2) not null check (amount > 0),
  effective_date date not null,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  check ((reversed_at is null and reversed_by is null) or (reversed_at is not null and reversed_by is not null and length(trim(coalesce(reversal_reason,''))) > 0))
);
create index if not exists payment_planning_realizations_item_idx on public.payment_planning_realizations(item_id,effective_date,id);

create table if not exists public.payment_planning_reservations (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.payment_planning_funds(id),
  kind text not null check (kind in ('reserve','release','consume')),
  amount numeric(15,2) not null check (amount > 0),
  effective_date date not null,
  target_item_id uuid references public.payment_planning_items(id),
  realization_id uuid unique references public.payment_planning_realizations(id),
  import_source_key text unique,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text
);
create index if not exists payment_planning_reservations_fund_idx on public.payment_planning_reservations(fund_id,effective_date,id);

create table if not exists public.payment_planning_transfers (
  id uuid primary key default gen_random_uuid(),
  source_fund_id uuid not null references public.payment_planning_funds(id),
  destination_fund_id uuid not null references public.payment_planning_funds(id),
  amount numeric(15,2) not null check (amount > 0),
  effective_date date not null,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  check (source_fund_id <> destination_fund_id)
);
create index if not exists payment_planning_transfers_date_idx on public.payment_planning_transfers(effective_date,id);

create table if not exists public.payment_planning_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null unique check (source_hash ~ '^[0-9a-f]{64}$'),
  source_name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_planning_scenario_rates (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.payment_planning_funds(id),
  title text not null check (length(trim(title)) between 2 and 120),
  valid_from date not null,
  valid_until date,
  weekdays integer[] not null default '{1,2,3,4,5,6}',
  optimistic numeric(15,2) not null default 0 check (optimistic >= 0),
  intermediate numeric(15,2) not null default 0 check (intermediate >= 0),
  pessimistic numeric(15,2) not null default 0 check (pessimistic >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check (weekdays <@ array[1,2,3,4,5,6,7] and cardinality(weekdays) > 0)
);
alter table public.payment_planning_items drop constraint if exists payment_planning_items_scenario_rule_id_fkey;
alter table public.payment_planning_items add constraint payment_planning_items_scenario_rule_id_fkey foreign key (scenario_rule_id) references public.payment_planning_scenario_rates(id);

create table if not exists public.payment_planning_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists payment_planning_events_entity_idx on public.payment_planning_events(entity_type,entity_id,id desc);

create table if not exists public.payment_planning_requests (
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id,request_key)
);

alter table public.payment_planning_funds enable row level security;
alter table public.payment_planning_balances enable row level security;
alter table public.payment_planning_recurrences enable row level security;
alter table public.payment_planning_items enable row level security;
alter table public.payment_planning_realizations enable row level security;
alter table public.payment_planning_reservations enable row level security;
alter table public.payment_planning_transfers enable row level security;
alter table public.payment_planning_import_batches enable row level security;
alter table public.payment_planning_scenario_rates enable row level security;
alter table public.payment_planning_events enable row level security;
alter table public.payment_planning_requests enable row level security;
revoke all on public.payment_planning_funds, public.payment_planning_balances, public.payment_planning_recurrences, public.payment_planning_items,
  public.payment_planning_realizations, public.payment_planning_reservations, public.payment_planning_transfers,
  public.payment_planning_scenario_rates, public.payment_planning_events,
  public.payment_planning_import_batches, public.payment_planning_requests from anon, authenticated;
grant all on public.payment_planning_funds, public.payment_planning_balances, public.payment_planning_recurrences, public.payment_planning_items,
  public.payment_planning_realizations, public.payment_planning_reservations, public.payment_planning_transfers,
  public.payment_planning_scenario_rates, public.payment_planning_events,
  public.payment_planning_import_batches, public.payment_planning_requests to service_role;
grant usage, select on sequence public.payment_planning_events_id_seq to service_role;

-- All writes go through this transaction. Only the server service role may call it.
create or replace function public.payment_planning_mutate(p_actor uuid, p_key uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  v_roles text[];
  v_prior public.payment_planning_requests%rowtype;
  v_item public.payment_planning_items%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_fund uuid;
  v_amount numeric(15,2);
  v_reserved numeric(15,2);
  v_realized numeric(15,2);
  v_id uuid;
  v_opening_date date;
  v_rule public.payment_planning_recurrences%rowtype;
  v_day date;
  v_created integer;
  v_row jsonb;
  v_source_key text;
  v_parts integer;
  v_part_amount numeric(15,2);
  v_group uuid;
  v_index integer;
  v_ids jsonb;
begin
  select array_remove(array_agg(distinct r),null) into v_roles
  from public.sellers s, lateral unnest(array_append(coalesce(s.roles,'{}'::text[]),s.role)) r
  where (s.id=p_actor or (
    not exists (select 1 from public.sellers direct_match where direct_match.id=p_actor)
    and lower(s.email)=(select lower(email) from auth.users where id=p_actor)
    and (select count(*) from public.sellers email_match where lower(email_match.email)=(select lower(email) from auth.users where id=p_actor))=1
  )) and s.is_active is distinct from false;
  if not 'admin'=any(coalesce(v_roles,'{}'::text[])) then
    raise exception 'Sin permiso de planificación.' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Datos inválidos.'; end if;
  select * into v_prior from public.payment_planning_requests where actor_id=p_actor and request_key=p_key;
  if found then
    if v_prior.action <> p_action or v_prior.payload <> p_payload then raise exception 'Clave de solicitud reutilizada con otros datos.'; end if;
    return v_prior.result;
  end if;

  if p_action='create_item' then
    v_fund := (p_payload->>'fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id=v_fund and active for update;
    if not found then raise exception 'Fondo inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    insert into public.payment_planning_items(fund_id,kind,title,amount,scheduled_date,due_date,status,priority,notes,is_adjustment,created_by)
    values (v_fund,p_payload->>'kind',trim(p_payload->>'title'),nullif(p_payload->>'amount','')::numeric,
      nullif(p_payload->>'scheduled_date','')::date,nullif(p_payload->>'due_date','')::date,
      coalesce(p_payload->>'status','active'),coalesce(p_payload->>'priority','normal'),coalesce(p_payload->>'notes',''),coalesce((p_payload->>'is_adjustment')::boolean,false),p_actor)
    returning * into v_item;
    v_result := to_jsonb(v_item);
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('item',v_item.id,'create',v_result,p_actor);

  elsif p_action in ('update_item','cancel_item') then
    select * into v_item from public.payment_planning_items where id=(p_payload->>'id')::uuid for update;
    if not found then raise exception 'Ítem inexistente.'; end if;
    if (select kind from public.payment_planning_funds where id=v_item.fund_id)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    if v_item.version <> (p_payload->>'version')::integer then raise exception 'El ítem cambió en otra sesión.' using errcode='40001'; end if;
    v_before := to_jsonb(v_item);
    select coalesce(sum(amount),0) into v_realized from public.payment_planning_realizations where item_id=v_item.id and reversed_at is null;
    if p_action='cancel_item' then
      update public.payment_planning_items set status='cancelled',version=version+1,updated_at=now() where id=v_item.id returning * into v_item;
    else
      v_amount := nullif(p_payload->>'amount','')::numeric;
      if v_amount is not null and v_amount < v_realized+v_item.closed_amount then raise exception 'El importe es menor que lo realizado o cerrado.'; end if;
      update public.payment_planning_items set
        title=trim(p_payload->>'title'), amount=v_amount,
        scheduled_date=nullif(p_payload->>'scheduled_date','')::date,
        due_date=nullif(p_payload->>'due_date','')::date,
        priority=coalesce(p_payload->>'priority',priority), notes=coalesce(p_payload->>'notes',notes),
        status=coalesce(p_payload->>'status',status), version=version+1, updated_at=now()
      where id=v_item.id returning * into v_item;
    end if;
    v_result := to_jsonb(v_item);
    insert into public.payment_planning_events(entity_type,entity_id,action,before_value,after_value,reason,actor_id)
      values ('item',v_item.id,p_action,v_before,v_result,p_payload->>'reason',p_actor);

  elsif p_action='realize' then
    select * into v_item from public.payment_planning_items where id=(p_payload->>'item_id')::uuid for update;
    if not found or v_item.status <> 'active' then raise exception 'El ítem no admite realizaciones.'; end if;
    if (select kind from public.payment_planning_funds where id=v_item.fund_id)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    v_amount := (p_payload->>'amount')::numeric;
    select coalesce(sum(amount),0) into v_realized from public.payment_planning_realizations where item_id=v_item.id and reversed_at is null;
    if v_item.amount is null or v_amount <= 0 or v_realized+v_amount+v_item.closed_amount > v_item.amount then
      raise exception 'La realización supera el importe pendiente.';
    end if;
    v_fund := coalesce(nullif(p_payload->>'fund_id','')::uuid,v_item.fund_id);
    if (select currency from public.payment_planning_funds where id=v_fund)<>(select currency from public.payment_planning_funds where id=v_item.fund_id) then
      raise exception 'La moneda del fondo no coincide.';
    end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    perform 1 from public.payment_planning_funds where id=v_fund for update;
    insert into public.payment_planning_realizations(item_id,fund_id,amount,effective_date,notes,created_by)
      values (v_item.id,v_fund,v_amount,(p_payload->>'effective_date')::date,coalesce(p_payload->>'notes',''),p_actor)
      returning id into v_id;
    -- A reservation assigned to this payment is consumed with the payment.
    select coalesce(sum(case when kind='reserve' then amount else -amount end),0) into v_reserved
      from public.payment_planning_reservations
      where fund_id=v_fund and target_item_id=v_item.id and reversed_at is null
        and effective_date <= (p_payload->>'effective_date')::date;
    if v_reserved > 0 then
      insert into public.payment_planning_reservations(fund_id,kind,amount,effective_date,target_item_id,realization_id,notes,created_by)
        values (v_fund,'consume',least(v_amount,v_reserved),(p_payload->>'effective_date')::date,v_item.id,v_id,'Consumo al registrar realización',p_actor);
    end if;
    update public.payment_planning_items set version=version+1,updated_at=now() where id=v_item.id;
    select to_jsonb(r) into v_result from public.payment_planning_realizations r where r.id=v_id;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('realization',v_id,'create',v_result,p_actor);

  elsif p_action='reverse_realization' then
    select i.* into v_item from public.payment_planning_items i join public.payment_planning_realizations r on r.item_id=i.id
      where r.id=(p_payload->>'id')::uuid for update of i;
    if not found then raise exception 'Realización inexistente.'; end if;
    if (select kind from public.payment_planning_funds where id=v_item.fund_id)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    if length(trim(coalesce(p_payload->>'reason',''))) < 3 then raise exception 'Indicá el motivo de reversión.'; end if;
    update public.payment_planning_realizations set reversed_at=now(),reversed_by=p_actor,reversal_reason=p_payload->>'reason'
      where id=(p_payload->>'id')::uuid and reversed_at is null returning to_jsonb(payment_planning_realizations.*) into v_result;
    if v_result is null then raise exception 'La realización ya fue revertida.'; end if;
    update public.payment_planning_reservations set reversed_at=now(),reversed_by=p_actor,reversal_reason=p_payload->>'reason'
      where realization_id=(p_payload->>'id')::uuid and reversed_at is null;
    update public.payment_planning_items set version=version+1,updated_at=now() where id=v_item.id;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,reason,actor_id)
      values ('realization',(p_payload->>'id')::uuid,'reverse',v_result,p_payload->>'reason',p_actor);

  elsif p_action='close_remaining' then
    select * into v_item from public.payment_planning_items where id=(p_payload->>'id')::uuid for update;
    if not found or v_item.status <> 'active' then raise exception 'Ítem inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_item.fund_id)='personal' and not 'admin'=any(v_roles) then raise exception 'Sin acceso a cuentas personales.' using errcode='42501'; end if;
    if length(trim(coalesce(p_payload->>'reason',''))) < 3 then raise exception 'Indicá el motivo del cierre.'; end if;
    select coalesce(sum(amount),0) into v_realized from public.payment_planning_realizations where item_id=v_item.id and reversed_at is null;
    v_before := to_jsonb(v_item);
    if v_item.amount is null then raise exception 'El importe no está definido.'; end if;
    update public.payment_planning_items set closed_amount=amount-v_realized,version=version+1,updated_at=now()
      where id=v_item.id returning to_jsonb(payment_planning_items.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,before_value,after_value,reason,actor_id)
      values ('item',v_item.id,'close_remaining',v_before,v_result,p_payload->>'reason',p_actor);

  elsif p_action='reopen_remaining' then
    select * into v_item from public.payment_planning_items where id=(p_payload->>'id')::uuid for update;
    if not found or v_item.status <> 'active' or v_item.closed_amount <= 0 then raise exception 'No hay un remanente cerrado.'; end if;
    if length(trim(coalesce(p_payload->>'reason',''))) < 3 then raise exception 'Indicá el motivo de reapertura.'; end if;
    v_before := to_jsonb(v_item);
    update public.payment_planning_items set closed_amount=0,version=version+1,updated_at=now()
      where id=v_item.id returning to_jsonb(payment_planning_items.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,before_value,after_value,reason,actor_id)
      values ('item',v_item.id,'reopen_remaining',v_before,v_result,p_payload->>'reason',p_actor);

  elsif p_action='create_installments' then
    v_fund := (p_payload->>'fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id=v_fund and active for update;
    if not found then raise exception 'Fondo inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then raise exception 'Sin acceso a cuentas personales.' using errcode='42501'; end if;
    v_parts := (p_payload->>'count')::integer;
    v_amount := (p_payload->>'total_amount')::numeric;
    if v_parts not between 2 and 60 or v_amount <= 0 then raise exception 'Cuotas inválidas.'; end if;
    v_part_amount := floor(v_amount*100/v_parts)/100;
    if v_part_amount <= 0 then raise exception 'El total debe alcanzar al menos un centavo por cuota.'; end if;
    v_group := gen_random_uuid();
    v_ids := '[]'::jsonb;
    for v_index in 1..v_parts loop
      insert into public.payment_planning_items(fund_id,kind,title,amount,scheduled_date,due_date,status,priority,notes,
        installment_group_id,installment_number,installment_count,created_by)
      values (v_fund,p_payload->>'kind',trim(p_payload->>'title'),
        case when v_index=v_parts then v_amount-v_part_amount*(v_parts-1) else v_part_amount end,
        ((p_payload->>'first_date')::date + make_interval(months=>v_index-1))::date,
        ((p_payload->>'first_date')::date + make_interval(months=>v_index-1))::date,
        'active','normal',coalesce(p_payload->>'notes',''),v_group,v_index,v_parts,p_actor)
      returning id into v_id;
      v_ids := v_ids || to_jsonb(v_id);
    end loop;
    v_result := jsonb_build_object('group_id',v_group,'item_ids',v_ids,'count',v_parts);
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('installment_group',v_group,'create',v_result,p_actor);

  elsif p_action='observe_balance' then
    v_fund := (p_payload->>'fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id=v_fund for update;
    if not found then raise exception 'Fondo inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    insert into public.payment_planning_balances(fund_id,effective_date,amount,reserved_amount,notes,created_by)
      values (v_fund,(p_payload->>'effective_date')::date,(p_payload->>'amount')::numeric,
        coalesce((p_payload->>'reserved_amount')::numeric,0),coalesce(p_payload->>'notes',''),p_actor)
      returning to_jsonb(payment_planning_balances.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('balance',(v_result->>'id')::uuid,'create',v_result,p_actor);

  elsif p_action='reservation' then
    v_fund := (p_payload->>'fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id=v_fund for update;
    if not found then raise exception 'Fondo inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    v_amount := (p_payload->>'amount')::numeric;
    if v_amount <= 0 then raise exception 'Importe inválido.'; end if;
    select effective_date,reserved_amount into v_opening_date,v_reserved from public.payment_planning_balances
      where fund_id=v_fund and effective_date <= (p_payload->>'effective_date')::date order by effective_date desc limit 1;
    select coalesce(v_reserved,0)+coalesce(sum(case when kind='reserve' then amount else -amount end),0) into v_reserved
      from public.payment_planning_reservations
      where fund_id=v_fund and reversed_at is null
        and effective_date >= coalesce(v_opening_date,'0001-01-01'::date)
        and effective_date <= (p_payload->>'effective_date')::date;
    if (p_payload->>'kind') in ('release','consume') and v_amount > v_reserved then raise exception 'La reserva disponible es insuficiente.'; end if;
    if nullif(p_payload->>'target_item_id','') is not null then
      perform 1 from public.payment_planning_items
        where id=(p_payload->>'target_item_id')::uuid and fund_id=v_fund and kind='expense' and status='active';
      if not found then raise exception 'Pago asignado a la reserva inválido.'; end if;
    end if;
    insert into public.payment_planning_reservations(fund_id,kind,amount,effective_date,target_item_id,notes,created_by)
      values (v_fund,p_payload->>'kind',v_amount,(p_payload->>'effective_date')::date,
        nullif(p_payload->>'target_item_id','')::uuid,coalesce(p_payload->>'notes',''),p_actor)
      returning to_jsonb(payment_planning_reservations.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('reservation',(v_result->>'id')::uuid,'create',v_result,p_actor);

  elsif p_action='scenario' then
    v_fund := (p_payload->>'fund_id')::uuid;
    select to_jsonb(f) into v_before from public.payment_planning_funds f where f.id=v_fund for update;
    if v_before is null then raise exception 'Fondo inválido.'; end if;
    if (v_before->>'kind')='personal' and not 'admin'=any(v_roles) then raise exception 'Sin acceso a cuentas personales.' using errcode='42501'; end if;
    update public.payment_planning_funds set scenario=p_payload->>'scenario' where id=v_fund returning to_jsonb(payment_planning_funds.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,before_value,after_value,actor_id)
      values ('fund',v_fund,'scenario',v_before,v_result,p_actor);

  elsif p_action='transfer' then
    v_fund := (p_payload->>'source_fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id in (v_fund,(p_payload->>'destination_fund_id')::uuid) and active order by id for update;
    if (select count(*) from public.payment_planning_funds where id in (v_fund,(p_payload->>'destination_fund_id')::uuid) and active) <> 2 then
      raise exception 'Fondos inválidos.';
    end if;
    if (select currency from public.payment_planning_funds where id=v_fund) <> (select currency from public.payment_planning_funds where id=(p_payload->>'destination_fund_id')::uuid) then
      raise exception 'No se puede transferir entre monedas distintas.';
    end if;
    if not 'admin'=any(v_roles) and exists (select 1 from public.payment_planning_funds where id in (v_fund,(p_payload->>'destination_fund_id')::uuid) and kind='personal') then
      raise exception 'Sin acceso a cuentas personales.' using errcode='42501';
    end if;
    insert into public.payment_planning_transfers(source_fund_id,destination_fund_id,amount,effective_date,notes,created_by)
      values (v_fund,(p_payload->>'destination_fund_id')::uuid,(p_payload->>'amount')::numeric,
        (p_payload->>'effective_date')::date,coalesce(p_payload->>'notes',''),p_actor)
      returning to_jsonb(payment_planning_transfers.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('transfer',(v_result->>'id')::uuid,'create',v_result,p_actor);

  elsif p_action='create_rate' then
    v_fund := (p_payload->>'fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id=v_fund for update;
    if not found then raise exception 'Fondo inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then raise exception 'Sin acceso a cuentas personales.' using errcode='42501'; end if;
    insert into public.payment_planning_scenario_rates(fund_id,title,valid_from,valid_until,weekdays,optimistic,intermediate,pessimistic,created_by)
      values (v_fund,trim(p_payload->>'title'),(p_payload->>'valid_from')::date,nullif(p_payload->>'valid_until','')::date,
        coalesce((select array_agg(value::integer) from jsonb_array_elements_text(p_payload->'weekdays')),array[1,2,3,4,5,6]),
        (p_payload->>'optimistic')::numeric,(p_payload->>'intermediate')::numeric,(p_payload->>'pessimistic')::numeric,p_actor)
      returning to_jsonb(payment_planning_scenario_rates.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('rate',(v_result->>'id')::uuid,'create',v_result,p_actor);

  elsif p_action='create_recurrence' then
    v_fund := (p_payload->>'fund_id')::uuid;
    perform 1 from public.payment_planning_funds where id=v_fund and active for update;
    if not found then raise exception 'Fondo inválido.'; end if;
    if (select kind from public.payment_planning_funds where id=v_fund)='personal' and not 'admin'=any(v_roles) then raise exception 'Sin acceso a cuentas personales.' using errcode='42501'; end if;
    insert into public.payment_planning_recurrences(fund_id,kind,title,amount,cadence,weekdays,month_day,start_date,end_date,created_by)
      values (v_fund,p_payload->>'kind',trim(p_payload->>'title'),(p_payload->>'amount')::numeric,
        p_payload->>'cadence',coalesce((select array_agg(value::integer) from jsonb_array_elements_text(p_payload->'weekdays')),array[1,2,3,4,5,6,7]),
        nullif(p_payload->>'month_day','')::integer,(p_payload->>'start_date')::date,nullif(p_payload->>'end_date','')::date,p_actor)
      returning to_jsonb(payment_planning_recurrences.*) into v_result;
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('recurrence',(v_result->>'id')::uuid,'create',v_result,p_actor);

  elsif p_action='generate_recurrence' then
    select * into v_rule from public.payment_planning_recurrences where id=(p_payload->>'id')::uuid and active for update;
    if not found then raise exception 'Regla inexistente.'; end if;
    if (select kind from public.payment_planning_funds where id=v_rule.fund_id)='personal' and not 'admin'=any(v_roles) then raise exception 'Sin acceso a cuentas personales.' using errcode='42501'; end if;
    if (p_payload->>'through_date')::date < v_rule.start_date or (p_payload->>'through_date')::date > current_date + 370 then raise exception 'Horizonte inválido.'; end if;
    v_created := 0;
    for v_day in select d::date from generate_series(v_rule.start_date,
      least((p_payload->>'through_date')::date,coalesce(v_rule.end_date,(p_payload->>'through_date')::date)),interval '1 day') d loop
      if (v_rule.cadence='daily' and extract(isodow from v_day)::integer=any(v_rule.weekdays))
         or (v_rule.cadence='weekly' and extract(isodow from v_day)::integer=any(v_rule.weekdays))
         or (v_rule.cadence='monthly' and extract(day from v_day)::integer=least(v_rule.month_day,extract(day from (date_trunc('month',v_day)+interval '1 month - 1 day'))::integer)) then
        insert into public.payment_planning_items(fund_id,kind,title,amount,scheduled_date,due_date,status,priority,notes,source,recurrence_id,occurrence_date,created_by)
          values (v_rule.fund_id,v_rule.kind,v_rule.title,v_rule.amount,v_day,v_day,'active','normal','','recurrence',v_rule.id,v_day,p_actor)
          on conflict (recurrence_id,occurrence_date) do nothing;
        if found then v_created := v_created+1; end if;
      end if;
    end loop;
    v_result := jsonb_build_object('rule_id',v_rule.id,'created',v_created);
    insert into public.payment_planning_events(entity_type,entity_id,action,after_value,actor_id)
      values ('recurrence',v_rule.id,'generate',v_result,p_actor);

  elsif p_action='import_rows' then
    if not 'admin'=any(v_roles) then raise exception 'Solo un administrador puede importar.' using errcode='42501'; end if;
    if jsonb_typeof(p_payload->'rows')<>'array' or jsonb_array_length(p_payload->'rows')=0 or jsonb_array_length(p_payload->'rows')>250 then
      raise exception 'La importación admite de 1 a 250 filas por lote.';
    end if;
    if exists (select 1 from public.payment_planning_import_batches where source_hash <> p_payload->>'source_hash') then
      raise exception 'Ya se importó otra captura. Conciliá las diferencias antes de cargar una nueva.';
    end if;
    insert into public.payment_planning_import_batches(source_hash,source_name,created_by)
      values (p_payload->>'source_hash',left(p_payload->>'source_name',240),p_actor)
      on conflict (source_hash) do nothing;
    v_created := 0;
    for v_row in select value from jsonb_array_elements(p_payload->'rows') loop
      v_source_key := (p_payload->>'source_hash') || ':' || (v_row->>'source_key');
      v_fund := (v_row->>'fund_id')::uuid;
      perform 1 from public.payment_planning_funds where id=v_fund and active for update;
      if not found then raise exception 'Fondo inválido en fila %.',v_row->>'source_key'; end if;
      if exists (select 1 from public.payment_planning_items where import_source_key=v_source_key)
        or exists (select 1 from public.payment_planning_reservations where import_source_key=v_source_key) then continue; end if;
      if v_row->>'record_type'='item' then
        insert into public.payment_planning_items(fund_id,kind,title,amount,scheduled_date,due_date,status,priority,notes,source,import_source_key,created_by)
          values (v_fund,v_row->>'kind',trim(v_row->>'title'),(v_row->>'amount')::numeric,(v_row->>'date')::date,
            (v_row->>'date')::date,'active','normal',coalesce(v_row->>'notes',''),'import',v_source_key,p_actor)
          on conflict (import_source_key) do nothing;
      elsif v_row->>'record_type'='reservation' then
        if v_row->>'kind'='release' then
          select effective_date,reserved_amount into v_opening_date,v_reserved from public.payment_planning_balances
            where fund_id=v_fund and effective_date <= (v_row->>'date')::date order by effective_date desc limit 1;
          select coalesce(v_reserved,0)+coalesce(sum(case when kind='reserve' then amount else -amount end),0) into v_reserved
            from public.payment_planning_reservations
            where fund_id=v_fund and reversed_at is null
              and effective_date >= coalesce(v_opening_date,'0001-01-01'::date)
              and effective_date <= (v_row->>'date')::date;
          if (v_row->>'amount')::numeric > v_reserved then
            raise exception 'Liberación de reserva sin saldo suficiente en fila %.',v_row->>'source_key';
          end if;
        end if;
        insert into public.payment_planning_reservations(fund_id,kind,amount,effective_date,notes,import_source_key,created_by)
          values (v_fund,v_row->>'kind',(v_row->>'amount')::numeric,(v_row->>'date')::date,
            coalesce(v_row->>'notes',''),v_source_key,p_actor)
          on conflict (import_source_key) do nothing;
      else raise exception 'Tipo inválido en fila %.',v_row->>'source_key'; end if;
      if found then v_created := v_created+1; end if;
    end loop;
    v_result := jsonb_build_object('created',v_created,'source_hash',p_payload->>'source_hash');
  else
    raise exception 'Acción desconocida.';
  end if;

  insert into public.payment_planning_requests(actor_id,request_key,action,payload,result)
    values (p_actor,p_key,p_action,p_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.payment_planning_mutate(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.payment_planning_mutate(uuid,uuid,text,jsonb) to service_role;
commit;
