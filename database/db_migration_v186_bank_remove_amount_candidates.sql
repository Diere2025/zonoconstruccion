-- Retire heuristic amount/date candidates. Preserve operation identity,
-- version checks, prior ledger links, permissions and idempotent commits.
begin;
create or replace function public.bank_statement_candidates(p_entry uuid,p_net boolean default false)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select '[]'::jsonb;
$$;
commit;
