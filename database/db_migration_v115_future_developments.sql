-- Private planning documents for the owner of Desarrollos futuros.
-- Content is seeded separately from a private local file, never in this migration.
begin;

create table if not exists public.future_development_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 120),
  title text not null check (length(trim(title)) between 3 and 180),
  status text not null default 'planned' check (status in ('idea', 'planned', 'in_progress', 'done')),
  content_md text not null default '' check (length(content_md) <= 200000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint future_development_owner_only check (owner_id = '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid),
  unique (owner_id, slug)
);

create index if not exists future_development_documents_owner_updated
  on public.future_development_documents (owner_id, updated_at desc, id desc);

alter table public.future_development_documents enable row level security;
revoke all on public.future_development_documents from public, anon, authenticated;
grant select, insert, update on public.future_development_documents to authenticated;

create policy future_development_owner_read on public.future_development_documents
  for select to authenticated
  using (owner_id = (select auth.uid()) and owner_id = '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid);

create policy future_development_owner_insert on public.future_development_documents
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and owner_id = '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid);

create policy future_development_owner_update on public.future_development_documents
  for update to authenticated
  using (owner_id = (select auth.uid()) and owner_id = '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid)
  with check (owner_id = (select auth.uid()) and owner_id = '381df0d1-183f-4ccb-aaf2-8147c76159a9'::uuid);

commit;
notify pgrst, 'reload schema';
