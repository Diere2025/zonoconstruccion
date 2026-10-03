begin;

create table if not exists public.private_marketing_prompts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  template_key text not null default 'general',
  parameters jsonb not null default '{}'::jsonb,
  prompt_text text not null check (length(prompt_text) between 1 and 40000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_marketing_prompts_owner_updated_idx
  on public.private_marketing_prompts (owner_id, updated_at desc);

alter table public.private_marketing_prompts enable row level security;

drop policy if exists private_marketing_prompts_owner on public.private_marketing_prompts;
create policy private_marketing_prompts_owner on public.private_marketing_prompts
  for all to authenticated
  using (owner_id = (select auth.uid()) and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'diego.boveda@gmail.com')
  with check (owner_id = (select auth.uid()) and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'diego.boveda@gmail.com');

revoke all on public.private_marketing_prompts from public, anon;
grant select, insert, update, delete on public.private_marketing_prompts to authenticated;

notify pgrst, 'reload schema';
commit;
