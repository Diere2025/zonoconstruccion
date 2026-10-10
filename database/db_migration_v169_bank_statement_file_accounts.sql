begin;
create table if not exists public.bank_statement_file_accounts (
 external_account_id text primary key check(external_account_id ~ '^[0-9]{1,30}$'),
 financial_account_id uuid not null references public.financial_accounts(id),
 version integer not null default 1,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default clock_timestamp()
);
alter table public.bank_statement_file_accounts enable row level security;
revoke all on public.bank_statement_file_accounts from public,anon,authenticated;
grant all on public.bank_statement_file_accounts to service_role;
create or replace function public.save_bank_statement_file_account(p_actor uuid,p_identifier text,p_account uuid,p_version integer default null,p_remove boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare previous bank_statement_file_accounts;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if p_identifier is null or p_identifier !~ '^[0-9]{1,30}$' then raise exception 'El identificador debe contener de 1 a 30 dígitos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_file_account:'||p_identifier,0));
 select * into previous from bank_statement_file_accounts where external_account_id=p_identifier for update;
 if found then
  if previous.version is distinct from p_version then raise exception 'La asociación cambió. Actualizá la configuración.' using errcode='40001';end if;
 elsif p_version is not null or p_remove then raise exception 'La asociación ya no existe.' using errcode='40001';
 end if;
 if p_remove then
  delete from bank_statement_file_accounts where external_account_id=p_identifier;
 else
  perform 1 from financial_accounts where id=p_account and is_active and currency='ARS' and type in ('banco','virtual') and name ~* '^Cuenta[. ]MP([0-9]+|Caro)$' for update;
  if not found then raise exception 'Elegí una cuenta Mercado Pago activa en ARS.';end if;
  insert into bank_statement_file_accounts(external_account_id,financial_account_id,updated_by)
   values(p_identifier,p_account,p_actor) on conflict(external_account_id) do update
   set financial_account_id=excluded.financial_account_id,version=bank_statement_file_accounts.version+1,updated_by=p_actor,updated_at=clock_timestamp();
 end if;
 insert into bank_statement_events(action,before_value,after_value,actor_id)
 values(case when p_remove then 'file_account.removed' else 'file_account.saved' end,to_jsonb(previous),jsonb_build_object('identifier',p_identifier,'account',p_account),p_actor);
end;
$$;
revoke all on function public.save_bank_statement_file_account(uuid,text,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.save_bank_statement_file_account(uuid,text,uuid,integer,boolean) to service_role;
-- User-confirmed mappings; existing configuration remains authoritative on reruns.
insert into public.bank_statement_file_accounts(external_account_id,financial_account_id)
 select seed.identifier,min(a.id::text)::uuid
 from (values ('3168927031','MP3'),('3711850510','MP5'),('3305755569','MP4')) seed(identifier,account)
 join public.financial_accounts a on a.name ~* ('^Cuenta[. ]'||seed.account||'$') and a.is_active and a.currency='ARS' and a.type in ('banco','virtual')
 group by seed.identifier having count(*)=1 on conflict(external_account_id) do nothing;
notify pgrst,'reload schema';
commit;
