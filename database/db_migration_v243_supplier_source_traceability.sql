-- Source evidence only. No supplier balances, cash or inventory are posted.
begin;
create table public.supplier_source_aliases (
 id uuid primary key default gen_random_uuid(),
 source_book text not null check(length(trim(source_book))>0),
 source_alias text not null check(length(trim(source_alias))>0),
 supplier_id uuid not null references public.suppliers(id),
 document_condition text check(document_condition in ('facturado','por_remito','historico')),
 business_label text,
 status text not null default 'proposed' check(status in ('proposed','verified','rejected')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 unique(source_book,source_alias),
 check(status<>'verified' or (reviewed_by is not null and reviewed_at is not null))
);
create table public.supplier_import_batches (
 id uuid primary key default gen_random_uuid(),
 source_book text not null, snapshot_hash text not null,
 cutoff_date date not null, captured_at timestamptz not null,
 status text not null default 'preview' check(status in ('preview','reviewed','applied','reversed')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(source_book,snapshot_hash)
);
create table public.supplier_import_rows (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.supplier_import_batches(id),
 sheet_id text not null, source_row integer not null check(source_row>0), component text not null,
 content_hash text not null, original_values jsonb not null,
 supplier_id uuid references public.suppliers(id), currency text check(currency in ('ARS','USD')),
 amount numeric(15,2) check(amount between -9999999999999.99 and 9999999999999.99), effective_date date,
 status text not null default 'ambiguous' check(status in ('linked','to_import','excluded','ambiguous','invalid','pending_evidence')),
 decision_reason text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 unique(batch_id,sheet_id,source_row,component),
 check(status<>'to_import' or (supplier_id is not null and currency is not null and amount is not null and effective_date is not null)),
 check(status not in ('linked','to_import','excluded') or (length(trim(coalesce(decision_reason,'')))>0 and reviewed_by is not null and reviewed_at is not null))
);
create table public.supplier_source_links (
 id uuid primary key default gen_random_uuid(), import_row_id uuid not null references public.supplier_import_rows(id),
 purchase_id uuid references public.supplier_purchases(id), payment_id uuid references public.supplier_payments(id),
 covered_amount numeric(15,2) not null,
 relation text not null check(relation in ('same_event','opening_composition','administrative_offset')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(num_nonnulls(purchase_id,payment_id)=1)
);
create unique index supplier_source_purchase_link on public.supplier_source_links(import_row_id,purchase_id) where purchase_id is not null;
create unique index supplier_source_payment_link on public.supplier_source_links(import_row_id,payment_id) where payment_id is not null;
create index supplier_import_supplier on public.supplier_import_rows(supplier_id,batch_id);
alter table public.supplier_source_aliases enable row level security;
alter table public.supplier_import_batches enable row level security;
alter table public.supplier_import_rows enable row level security;
alter table public.supplier_source_links enable row level security;
revoke all on public.supplier_source_aliases,public.supplier_import_batches,public.supplier_import_rows,public.supplier_source_links from public,anon,authenticated;
grant all on public.supplier_source_aliases,public.supplier_import_batches,public.supplier_import_rows,public.supplier_source_links to service_role;
commit;
