begin;

create or replace function public.can_manage_treasury_settlements(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    left join public.sellers s
      on s.id = u.id or lower(s.email) = lower(u.email)
    where u.id = p_user_id
      and coalesce(s.is_active, true) is distinct from false
      and (
        lower(coalesce(u.email, '')) in ('diego.boveda@gmail.com', 'caroibarra.93@gmail.com')
        or s.role in ('admin', 'administracion')
        or coalesce(s.roles, '{}'::text[]) && array['admin', 'administracion']::text[]
      )
  );
$$;

notify pgrst, 'reload schema';

commit;
