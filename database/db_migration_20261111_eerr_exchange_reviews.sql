begin;

create table public.eerr_exchange_reviews (
  order_id uuid primary key references public.orders(id),
  status text not null check (status in (
    'pending', 'supplier_requested', 'supplier_partial', 'supplier_recognized',
    'supplier_rejected', 'own_unusable', 'own_repairable', 'own_reusable', 'other_reviewed'
  )),
  supplier text not null check (length(supplier) <= 160),
  recognized_amount numeric check (
    recognized_amount is null or (
      status in ('supplier_partial', 'supplier_recognized') and
      recognized_amount > 0 and recognized_amount <= 1000000000000 and
      recognized_amount = round(recognized_amount, 2)
    )
  ),
  note text not null check (length(note) <= 1500 and (status = 'pending' or length(trim(note)) > 0)),
  version integer not null check (version > 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  check (case when left(status, 9) = 'supplier_' then length(trim(supplier)) > 0 else supplier = '' end)
);

create table public.eerr_exchange_review_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.eerr_exchange_reviews(order_id),
  actor_id uuid not null references auth.users(id),
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.eerr_exchange_reviews enable row level security;
alter table public.eerr_exchange_review_events enable row level security;
revoke all on public.eerr_exchange_reviews, public.eerr_exchange_review_events from public, anon, authenticated;
grant select on public.eerr_exchange_reviews, public.eerr_exchange_review_events to service_role;

create function public.save_eerr_exchange_review(p_actor uuid, p_order uuid, p_version integer, p_review jsonb)
returns public.eerr_exchange_reviews
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  previous eerr_exchange_reviews;
  saved eerr_exchange_reviews;
begin
  if not coalesce(can_manage_financial_operations(p_actor), false) then
    raise exception 'Sin permiso para revisar cambios.' using errcode='42501';
  end if;
  if p_order is null or p_version is null or p_version < 0 or jsonb_typeof(p_review) is distinct from 'object' then
    raise exception 'Revisión inválida.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('eerr-exchange:' || p_order::text, 0));
  perform 1 from orders o
    where o.id = p_order and trim(o.legacy_code) ~* '^CAMB([0-9]|[^[:alnum:]_]|$)'
      and lower(trim(coalesce(o.status, ''))) not in ('cancelado','cancelada','anulado','anulada')
    for share;
  if not found or not exists (
    select 1 from deliveries d where d.order_id = p_order and d.status = 'entregado'
      and d.real_delivery_date < (now() at time zone 'America/Argentina/Buenos_Aires')::date
  ) then
    raise exception 'El pedido debe ser un cambio con entrega confirmada.';
  end if;

  select * into previous from eerr_exchange_reviews where order_id = p_order for update;
  if coalesce(previous.version, 0) <> p_version then
    raise exception 'La revisión cambió. Actualizá el informe antes de guardar.' using errcode='40001';
  end if;

  insert into eerr_exchange_reviews(order_id, status, supplier, recognized_amount, note, version, updated_by)
  values(p_order, p_review->>'status', trim(p_review->>'supplier'),
    (p_review->>'recognized_amount')::numeric, trim(p_review->>'note'), p_version + 1, p_actor)
  on conflict (order_id) do update set
    status=excluded.status, supplier=excluded.supplier, recognized_amount=excluded.recognized_amount,
    note=excluded.note, version=excluded.version, updated_by=excluded.updated_by, updated_at=now()
  returning * into saved;

  insert into eerr_exchange_review_events(order_id, actor_id, before_value, after_value)
    values (p_order, p_actor, case when previous.order_id is not null then to_jsonb(previous) end, to_jsonb(saved));
  return saved;
end $$;

revoke all on function public.save_eerr_exchange_review(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_eerr_exchange_review(uuid, uuid, integer, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
