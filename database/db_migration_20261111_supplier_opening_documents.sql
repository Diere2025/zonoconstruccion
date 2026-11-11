-- Internal references for existing opening balances. No new ledger entries.
begin;
select pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
create table if not exists public.supplier_opening_documents (
 number bigint generated always as identity primary key,
 supplier_id uuid not null references public.supplier_account_starts(supplier_id) on delete restrict,
 currency text not null check(currency in ('ARS','USD')),
 created_at timestamptz not null default now(),
 unique(supplier_id,currency)
);
alter table public.supplier_opening_documents enable row level security;
revoke all on public.supplier_opening_documents from public,anon,authenticated;
grant select,insert on public.supplier_opening_documents to service_role;
grant usage,select on sequence public.supplier_opening_documents_number_seq to service_role;

insert into public.supplier_opening_documents(supplier_id,currency)
select s.supplier_id,c.currency from public.supplier_account_starts s
cross join lateral(values('ARS',s.opening_ars),('USD',s.opening_usd)) c(currency,amount)
where c.amount<>0 order by s.supplier_id,c.currency
on conflict(supplier_id,currency) do nothing;

create or replace function public.register_supplier_opening_document() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into supplier_opening_documents(supplier_id,currency)
 select new.supplier_id,c.currency from (values('ARS',new.opening_ars),('USD',new.opening_usd)) c(currency,amount)
 where c.amount<>0 on conflict(supplier_id,currency) do nothing;
 return new;
end $$;
revoke all on function public.register_supplier_opening_document() from public,anon,authenticated;
drop trigger if exists supplier_opening_document_register on public.supplier_account_starts;
create trigger supplier_opening_document_register after insert or update of opening_ars,opening_usd
on public.supplier_account_starts for each row execute function public.register_supplier_opening_document();

-- Keep the original item keys: existing payment/credit applications remain valid.
create or replace view public.supplier_opening_parts as
select 'opening:'||i.supplier_id||':'||i.currency||':'||i.number item_key,
 i.supplier_id,i.number,i.currency,i.amount,i.reference,i.document_condition,i.document_date,i.due_date,i.evidence
from public.supplier_opening_items i
union all
select 'opening:'||s.supplier_id||':'||c.currency||':0',s.supplier_id,0,c.currency,c.amount,
 'SCI-'||lpad(d.number::text,greatest(6,length(d.number::text)),'0')||' · Saldo inicial'||
 case when c.amount<0 then ' a favor' else ' de deuda' end,
 'sin_detalle',s.start_date,null::date,s.notes
from public.supplier_account_starts s
cross join lateral(values('ARS',s.opening_ars),('USD',s.opening_usd)) c(currency,amount)
join public.supplier_opening_documents d on d.supplier_id=s.supplier_id and d.currency=c.currency
where c.amount<>0 and not exists(select 1 from public.supplier_opening_items i where i.supplier_id=s.supplier_id);
comment on table public.supplier_opening_documents is
 'Comprobantes internos del saldo inicial existente, por proveedor y moneda. No son facturas ni generan compras, caja o gastos. Importes y fecha se consultan en supplier_account_starts; aplicaciones conservan sus claves originales.';
notify pgrst,'reload schema';
commit;
