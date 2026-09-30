-- Supplier account cutover. No historical records are deleted or re-posted.
begin;

create table if not exists public.supplier_account_starts (
  supplier_id uuid primary key references public.suppliers(id) on delete restrict,
  start_date date not null,
  opening_ars numeric(15,2) not null default 0,
  opening_usd numeric(15,2) not null default 0,
  notes text not null default '',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.supplier_account_history (
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  source text not null check (source in ('purchase','payment')),
  source_id uuid not null,
  included boolean not null,
  notes text not null check (length(trim(notes)) > 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (supplier_id, source, source_id)
);
create table if not exists public.supplier_account_audit (
  id bigint generated always as identity primary key,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.supplier_account_starts enable row level security;
alter table public.supplier_account_history enable row level security;
alter table public.supplier_account_audit enable row level security;
-- Read and write through the authenticated administrator API only.
revoke all on public.supplier_account_starts, public.supplier_account_history, public.supplier_account_audit from anon, authenticated;
grant all on public.supplier_account_starts, public.supplier_account_history, public.supplier_account_audit to service_role;
grant usage, select on sequence public.supplier_account_audit_id_seq to service_role;

create or replace function public.audit_supplier_account_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  insert into public.supplier_account_audit(supplier_id,action,before_value,after_value,created_by)
  values (new.supplier_id, tg_table_name,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new), new.updated_by);
  return new;
end;
$$;
drop trigger if exists supplier_account_start_audit on public.supplier_account_starts;
create trigger supplier_account_start_audit after insert or update on public.supplier_account_starts
for each row execute function public.audit_supplier_account_change();
drop trigger if exists supplier_account_history_audit on public.supplier_account_history;
create trigger supplier_account_history_audit after insert or update on public.supplier_account_history
for each row execute function public.audit_supplier_account_change();

-- Both sources use the business date in Buenos Aires. Payments linked to a cash
-- transaction follow the date of that transaction, not the date of reconciliation.
create or replace view public.supplier_account_entries as
select p.supplier_id, 'purchase'::text as source, p.id as source_id,
  (coalesce(p.purchase_date,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date as entry_date,
  p.currency, p.invoice_number as reference, coalesce(p.document_type,'Factura') as kind,
  round(case when p.document_type = 'Nota de Crédito' then -p.total_amount else p.total_amount end,2) as amount,
  p.status = 'Anulado' as voided, p.notes, p.purchase_order_id, p.purchase_reception_id,
  null::uuid as cash_transaction_id
from public.supplier_purchases p
union all
select p.supplier_id, 'payment', p.id,
  (coalesce(t.created_at,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date,
  p.currency, coalesce(t.concept,p.notes,'Pago a proveedor'), 'Pago', -round(p.amount,2),
  false, p.notes, null::uuid, null::uuid, p.cash_transaction_id
from public.supplier_payments p left join public.cash_transactions t on t.id = p.cash_transaction_id;
revoke all on public.supplier_account_entries from anon, authenticated;
grant select on public.supplier_account_entries to service_role;

create or replace function public.get_supplier_account_balances()
returns table(id uuid, name text, start_date date, balance_ars numeric, balance_usd numeric)
language sql stable set search_path = public, pg_temp as $$
  select s.id, s.name::text, c.start_date,
    coalesce(c.opening_ars,0) + coalesce(sum(e.amount) filter (where e.currency='ARS'),0),
    coalesce(c.opening_usd,0) + coalesce(sum(e.amount) filter (where e.currency='USD'),0)
  from public.suppliers s
  left join public.supplier_account_starts c on c.supplier_id=s.id
  left join (
    select e.* from public.supplier_account_entries e
    join public.supplier_account_starts c on c.supplier_id=e.supplier_id
    left join public.supplier_account_history h on h.supplier_id=e.supplier_id and h.source=e.source and h.source_id=e.source_id
    where not coalesce(e.voided,false) and coalesce(h.included,e.entry_date >= c.start_date)
  ) e on e.supplier_id=s.id
  group by s.id,s.name,c.start_date,c.opening_ars,c.opening_usd
  order by s.name,s.id;
$$;
revoke all on function public.get_supplier_account_balances() from public, anon, authenticated;
grant execute on function public.get_supplier_account_balances() to service_role;
commit;
