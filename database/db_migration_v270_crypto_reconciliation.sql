begin;

create table public.crypto_reconciliation_entries (
  id uuid primary key,
  day date not null,
  kind text not null check (kind in ('opening','p2p','transfer','ad_funding','ad_spend','service','redot_ads','personal','fee')),
  wallet text not null check (wallet in ('binance','redot','ads')),
  reference text not null check (length(btrim(reference)) between 1 and 200),
  detail text not null default '' check (length(detail) <= 1000),
  amount numeric not null check ((amount > 0 or (kind = 'opening' and amount = 0)) and amount < 1e12 and scale(amount) <= 8),
  credited numeric check (credited > 0 and credited < 1e12 and scale(credited) <= 8),
  bank_transaction_id uuid references public.cash_transactions(id) on delete set null,
  bank_code text,
  bank_amount numeric,
  original_amount numeric check (original_amount > 0 and original_amount < 1e12 and scale(original_amount) <= 8),
  original_currency text check (original_currency ~ '^[A-Z]{3}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  check (bank_transaction_id is null or kind = 'p2p'),
  check ((kind = 'p2p') = (bank_code is not null)),
  check ((kind = 'p2p') = (bank_amount is not null)),
  check ((kind in ('transfer','ad_funding')) = (credited is not null)),
  check (kind <> 'transfer' or credited <= amount),
  check ((original_amount is null) = (original_currency is null)),
  check (original_amount is null or kind in ('service','redot_ads','personal')),
  check (case kind
    when 'opening' then true
    when 'p2p' then wallet = 'binance'
    when 'transfer' then wallet = 'binance'
    when 'ad_funding' then wallet in ('binance','redot')
    when 'ad_spend' then wallet = 'ads'
    when 'fee' then wallet in ('binance','redot')
    else wallet = 'redot'
  end)
);
alter table public.crypto_reconciliation_entries enable row level security;
revoke all on public.crypto_reconciliation_entries from public, anon, authenticated, service_role;

create unique index crypto_reconciliation_reference on public.crypto_reconciliation_entries
  ((case when kind in ('service','redot_ads','personal') then 'redot_charge' else kind end),
   wallet,lower(btrim(reference))) where voided_at is null;
create unique index crypto_reconciliation_bank_payment on public.crypto_reconciliation_entries
  (bank_transaction_id) where voided_at is null and bank_transaction_id is not null;
create unique index crypto_reconciliation_opening on public.crypto_reconciliation_entries
  (wallet) where kind = 'opening' and voided_at is null;

create function public.save_crypto_reconciliation_entry(p_actor uuid, p_id uuid, p_entry jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing crypto_reconciliation_entries%rowtype;
  entry crypto_reconciliation_entries%rowtype;
  payment cash_transactions%rowtype;
begin
  if not can_manage_financial_operations(p_actor) then
    raise exception 'No tenés permisos para registrar la conciliación.' using errcode = '42501';
  end if;
  entry := jsonb_populate_record(null::crypto_reconciliation_entries, p_entry);
  entry.id := p_id;
  entry.created_by := p_actor;
  entry.detail := coalesce(entry.detail,'');
  if entry.day > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha del movimiento no puede ser futura.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('crypto-reconciliation:' || p_id, 0));
  select * into existing from crypto_reconciliation_entries where id = p_id;
  if found then
    if (existing.created_by,existing.day,existing.kind,existing.wallet,existing.reference,existing.detail,
        existing.amount,existing.credited,existing.bank_code,existing.bank_amount,existing.original_amount,existing.original_currency)
       is not distinct from
       (p_actor,entry.day,entry.kind,entry.wallet,entry.reference,entry.detail,entry.amount,entry.credited,
        entry.bank_code,entry.bank_amount,entry.original_amount,entry.original_currency) then
      return;
    end if;
    raise exception 'La solicitud ya se usó con otros datos.';
  end if;

  if entry.kind = 'transfer' and entry.credited > entry.amount then
    raise exception 'Redot debe recibir como máximo los USDT debitados en Binance.';
  end if;

  if entry.kind = 'p2p' then
    select t.* into payment from cash_transactions t
    where t.movement_code = entry.bank_code and t.type = 'egreso'
      and t.currency = 'ARS' and t.financial_account_id is not null and t.amount = entry.bank_amount
      and t.reversal_of_transaction_id is null
      and not exists (select 1 from cash_transactions r where r.reversal_of_transaction_id = t.id)
      and not exists (select 1 from financial_operations o where o.id = t.operation_id and o.status = 'cancelled')
    for update of t;
    if not found then
      raise exception 'El código y el importe deben coincidir con un egreso vigente en pesos del ERP.';
    end if;
    entry.bank_transaction_id := payment.id;
  end if;

  insert into crypto_reconciliation_entries
    (id, day, kind, wallet, reference, detail, amount, credited, bank_transaction_id, bank_code, bank_amount,
     original_amount, original_currency, created_by)
  values
    (entry.id, entry.day, entry.kind, entry.wallet, entry.reference, entry.detail, entry.amount,
     entry.credited, entry.bank_transaction_id, entry.bank_code, entry.bank_amount, entry.original_amount,
     entry.original_currency, entry.created_by);
exception when unique_violation then
  raise exception 'La referencia, el egreso bancario o el saldo inicial ya están registrados.' using errcode = '23505';
end;
$$;

create function public.void_crypto_reconciliation_entry(p_actor uuid, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not can_manage_financial_operations(p_actor) then
    raise exception 'No tenés permisos para anular la conciliación.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Ingresá un motivo de anulación.';
  end if;
  update crypto_reconciliation_entries set voided_at = now(), voided_by = p_actor, void_reason = btrim(p_reason)
  where id = p_id and voided_at is null;
  if not found and not exists (
    select 1 from crypto_reconciliation_entries where id = p_id and voided_by = p_actor and void_reason = btrim(p_reason)
  ) then
    raise exception 'El movimiento ya fue anulado o no está disponible.';
  end if;
end;
$$;

create function public.read_crypto_reconciliation(p_actor uuid, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not can_manage_financial_operations(p_actor) then
    raise exception 'No tenés permisos para consultar la conciliación.' using errcode = '42501';
  end if;
  return (
    with totals as (
      select wallet,
        coalesce(sum(case
          when kind = 'transfer' and wallet = 'redot' then credited
          when kind = 'ad_funding' and wallet = 'ads' then credited
          when kind in ('opening','p2p') then amount
          else -amount
        end),0) as balance,
        count(*) filter (where kind = 'opening') > 0 as has_opening
      from (
        select wallet, kind, amount, credited from crypto_reconciliation_entries where voided_at is null
        union all
        select case kind when 'transfer' then 'redot' else 'ads' end, kind, amount, credited
        from crypto_reconciliation_entries where voided_at is null and kind in ('transfer','ad_funding')
      ) legs
      group by wallet
    ), page as (
      select e.id,e.day,e.kind,e.wallet,e.reference,e.detail,e.amount::text,e.credited::text,
        e.bank_amount::text,e.original_amount::text,e.original_currency,e.void_reason,e.created_at,
        e.bank_transaction_id,e.bank_code,a.name as bank_account,
        case when e.kind = 'transfer' then (e.amount - e.credited)::text end as transfer_fee,
        case when e.kind = 'p2p' then coalesce(t.type = 'egreso' and t.currency = 'ARS'
          and t.financial_account_id is not null and t.amount = e.bank_amount
          and t.reversal_of_transaction_id is null and o.status is distinct from 'cancelled'
          and not exists (select 1 from cash_transactions r where r.reversal_of_transaction_id = t.id),false)
        end as bank_matches
      from crypto_reconciliation_entries e
      left join cash_transactions t on t.id = e.bank_transaction_id
      left join financial_accounts a on a.id = t.financial_account_id
      left join financial_operations o on o.id = t.operation_id
      order by e.day desc,e.created_at desc,e.id desc
      offset greatest(p_offset,0) limit 51
    )
    select jsonb_build_object(
      'balances',(select jsonb_object_agg(wallet,jsonb_build_object('amount',balance::text,'hasOpening',has_opening)) from totals),
      'entries',coalesce((select jsonb_agg(to_jsonb(page) order by day desc,created_at desc,id desc) from page),'[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.save_crypto_reconciliation_entry(uuid,uuid,jsonb),
  public.void_crypto_reconciliation_entry(uuid,uuid,text), public.read_crypto_reconciliation(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.save_crypto_reconciliation_entry(uuid,uuid,jsonb),
  public.void_crypto_reconciliation_entry(uuid,uuid,text), public.read_crypto_reconciliation(uuid,integer)
  to service_role;

notify pgrst,'reload schema';
commit;
