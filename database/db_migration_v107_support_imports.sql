-- Historical source ledger: private to support administrators, server-owned writes.
create table if not exists public.support_import_items (
 id uuid primary key default gen_random_uuid(),
 spreadsheet_id text not null,
 sheet_id bigint not null,
 legacy_id text not null,
 source_row integer not null check(source_row > 1),
 source_hash text not null,
 source_data jsonb not null,
 ticket_id uuid not null unique references public.support_tickets(id),
 imported_by uuid not null references public.support_profiles(user_id),
 imported_at timestamptz not null default now(),
 unique(spreadsheet_id,sheet_id,legacy_id)
);
alter table public.support_import_items enable row level security;
revoke all on public.support_import_items from anon, authenticated;
grant select on public.support_import_items to authenticated;
create policy support_import_items_admin_read on public.support_import_items for select to authenticated using(public.support_is_admin());
