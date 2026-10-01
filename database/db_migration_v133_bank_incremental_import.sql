begin;
alter table public.cash_transactions add column if not exists bank_import_key text;
create unique index if not exists cash_transactions_bank_import_key_uq on public.cash_transactions(bank_import_key) where bank_import_key is not null;

create or replace function public.import_bank_movements(p_actor uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_roles text[];v_row jsonb;v_account financial_accounts%rowtype;v_method uuid;v_amount numeric;v_date date;v_inserted int:=0;v_skipped int:=0;
begin
  select array_remove(array_agg(distinct r),null) into v_roles
  from sellers s,lateral unnest(array_append(coalesce(s.roles,'{}'::text[]),s.role)) r
  where (s.id=p_actor or (not exists(select 1 from sellers d where d.id=p_actor)
    and lower(s.email)=(select lower(email) from auth.users where id=p_actor)
    and (select count(*) from sellers e where lower(e.email)=(select lower(email) from auth.users where id=p_actor))=1)) and s.is_active is distinct from false;
  if not 'admin'=any(coalesce(v_roles,'{}'::text[])) then raise exception 'Sin permiso para importar.' using errcode='42501';end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Seleccioná entre 1 y 1000 movimientos.';end if;
  perform pg_advisory_xact_lock(hashtextextended('bank_incremental_import',0));
  select id into v_method from payment_methods where lower(name) like '%transferencia%' or lower(name) like '%mercado%' order by case when name='Transferencia' then 0 else 1 end,id limit 1;
  if v_method is null then raise exception 'Falta configurar el medio de pago Transferencia.';end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    select * into v_account from financial_accounts where id=(v_row->>'accountId')::uuid for update;
    if not found or v_account.type='efectivo' or v_account.currency<>'ARS' or v_account.is_active is distinct from true
      or v_account.name not in ('Cuenta MP1','Cuenta MP2','Cuenta MP3','Cuenta MP4','Cuenta MP5','Cuenta Galicia','Galicia.Mas','Visa.Galicia','Cuenta Santander','Cuenta ICBC','Inversiones') then raise exception 'La cuenta no admite esta importación bancaria.';end if;
    v_amount:=(v_row->>'amount')::numeric;v_date:=(v_row->>'date')::date;
    if v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2) or v_date is null or coalesce(v_row->>'type','') not in ('ingreso','egreso')
      or coalesce(v_row->>'key','') !~ '^bank-sheet:[0-9a-f]{64}$' or length(trim(coalesce(v_row->>'concept','')))=0 then raise exception 'Fila de importación inválida.';end if;
    if exists(select 1 from cash_transactions where bank_import_key=v_row->>'key')
      or exists(select 1 from cash_transactions where financial_account_id=v_account.id and type=v_row->>'type' and amount=v_amount
        and created_at >= (v_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and created_at < ((v_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')) then
      v_skipped:=v_skipped+1;continue;
    end if;
    insert into cash_transactions(type,category,sub_category,efe_category,business_unit,amount,currency,exchange_rate,concept,created_at,created_by,payment_method_id,financial_account_id,is_imported,bank_import_key,notes)
    values(v_row->>'type',coalesce(nullif(v_row->>'category',''),'Otro'),nullif(v_row->>'subCategory',''),nullif(v_row->>'efeCategory',''),'ZONO',
      v_amount,'ARS',1,v_row->>'concept',(v_date+time '12:00') at time zone 'America/Argentina/Buenos_Aires',p_actor,v_method,v_account.id,true,v_row->>'key',
      'Importación incremental bancaria · Finanzas - Finanzas · fila '||coalesce(v_row->>'sheetRow',''));
    v_inserted:=v_inserted+1;
  end loop;
  return jsonb_build_object('inserted',v_inserted,'skipped',v_skipped);
end;
$$;
revoke all on function public.import_bank_movements(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_bank_movements(uuid,jsonb) to service_role;
commit;
