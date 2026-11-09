begin;

create index if not exists financial_partner_reimbursement_source
  on public.financial_operations ((detail#>>'{input,resource_id}'))
  where operation_type='partner_equity' and status='posted' and detail#>>'{input,action}'='reimbursement';

create or replace function public.partner_withdrawal_balances(p_id uuid default null, p_search text default '')
returns table(id uuid,effective_date date,counterparty text,reference text,currency text,amount numeric,remaining numeric)
language sql stable security definer set search_path=public,pg_temp as $$
  with sources as (
    select o.id,o.effective_date,coalesce(o.detail#>>'{input,counterparty}','Socio') counterparty,
      coalesce(m.movement_code,o.detail#>>'{input,reference}','Retiro') reference,
      coalesce(m.currency,a.currency) currency,
      coalesce(m.amount,nullif(o.detail#>>'{input,amount}','')::numeric) amount
    from financial_operations o
    left join financial_accounts a on a.id=nullif(o.detail#>>'{input,account_id}','')::uuid
    left join cash_transactions m on m.operation_id=o.id and m.operation_line='main' and m.type='egreso'
      and m.reversal_of_transaction_id is null
    where (p_id is null or o.id=p_id) and o.status='posted' and o.operation_type='partner_equity'
      and o.detail#>>'{input,action}'='withdrawal'
      and (m.id is not null or o.detail#>>'{input,partner_mode}'='linked')
    union all
    select t.id,(t.created_at at time zone 'America/Argentina/Buenos_Aires')::date,
      coalesce(nullif(t.sub_category,''),nullif(t.concept,''),'Extracción'),
      coalesce(t.movement_code,t.id::text),t.currency,t.amount
    from cash_transactions t left join financial_operations o on o.id=t.operation_id
    where (p_id is null or t.id=p_id) and t.type='egreso' and lower(trim(t.category))='extracciones'
      and (t.operation_id is null or (o.status='posted' and o.operation_type='general'))
      and t.reversal_of_transaction_id is null
      and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
  )
  select s.id,s.effective_date,s.counterparty,s.reference,s.currency,s.amount,
    s.amount-coalesce((select sum((r.detail#>>'{input,amount}')::numeric)
      from financial_operations r where r.status='posted' and r.operation_type='partner_equity'
        and r.detail#>>'{input,action}'='reimbursement' and r.detail#>>'{input,resource_id}'=s.id::text),0) remaining
  from sources s where s.amount>0 and s.currency is not null
    and (trim(coalesce(p_search,''))='' or strpos(lower(concat_ws(' ',s.counterparty,s.reference)),lower(trim(p_search)))>0)
  order by s.effective_date desc,s.reference desc,s.id
$$;

create or replace function public.persist_partner_reimbursement(p_actor uuid,p_key uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  source record;
  prior financial_operation_requests;
  destination financial_accounts;
  source_id uuid := (p_input->>'resource_id')::uuid;
  amount numeric := (p_input->>'amount')::numeric;
  effective_day date := (p_input->>'effective_date')::date;
  mode text := p_input->>'reimbursement_mode';
  vouchers jsonb := coalesce(p_input->'voucher_ids','[]'::jsonb);
  lines jsonb := '[]'::jsonb;
  result jsonb;
begin
  if not public.can_manage_financial_operations(p_actor) then
    raise exception 'No tenés permiso para guardar.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('special-financial-operations',0));
  select * into prior from financial_operation_requests where actor_id=p_actor and request_key=p_key;
  if found then
    if prior.action<>'special.save' or prior.payload<>p_input then
      raise exception 'La solicitud ya fue usada con otros datos.' using errcode='23505';
    end if;
    return prior.result;
  end if;
  if p_input->>'operation_type' is distinct from 'partner_equity'
     or p_input->>'action' is distinct from 'reimbursement'
     or amount is null or amount<=0 or amount>=1e12 or amount<>round(amount,2)
     or effective_day is null or effective_day>(now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Importe o fecha de reintegro inválidos.';
  end if;

  -- Use the same lock order as the financial core before locking a legacy movement.
  lock table public.cash_transactions in share row exclusive mode;
  perform 1 from financial_operations where id=source_id for update;
  if not found then perform 1 from cash_transactions where id=source_id for update; end if;
  select * into source from public.partner_withdrawal_balances(source_id);
  if not found then raise exception 'La extracción original no está disponible.'; end if;
  if effective_day<source.effective_date then raise exception 'La devolución no puede ser anterior a la extracción.'; end if;
  if amount>source.remaining then
    raise exception 'El reintegro supera el saldo pendiente de la extracción.' using errcode='40001';
  end if;

  if mode='cash' then
    select * into destination from financial_accounts where id=(p_input->>'account_id')::uuid
      and is_active and not is_custody and type in ('efectivo','banco','virtual');
    if not found or destination.currency<>source.currency then
      raise exception 'Elegí una cuenta de Tesorería en la moneda de la extracción.';
    end if;
    lines:=jsonb_build_array(jsonb_build_object('account_id',destination.id,'direction','ingreso',
      'amount',amount,'category','Socios','line','main'));
  elsif mode='compensation' then
    if nullif(trim(p_input->>'reference'),'') is null or jsonb_array_length(vouchers)=0 then
      raise exception 'Ingresá la referencia del gasto y adjuntá su comprobante.';
    end if;
    if exists (
      select 1 from operation_vouchers v join financial_operations o on o.id=v.operation_id
      where v.voucher_id in (select x::uuid from jsonb_array_elements_text(vouchers) x)
        and o.status='posted' and o.operation_type='partner_equity' and o.detail#>>'{input,action}'='reimbursement'
    ) then raise exception 'El comprobante ya está vinculado a otro reintegro vigente.'; end if;
    if exists (
      select 1 from jsonb_array_elements_text(vouchers) x
      where not exists(select 1 from treasury_vouchers v where v.id=x::uuid and v.currency=source.currency
        and v.status<>'rejected' and jsonb_typeof(to_jsonb(v.files))='array' and jsonb_array_length(to_jsonb(v.files))>0)
    ) then raise exception 'Adjuntá un comprobante de gasto en la moneda de la extracción.'; end if;
    if amount>(select coalesce(sum(v.amount),0) from treasury_vouchers v
      where v.id in (select x::uuid from jsonb_array_elements_text(vouchers) x)) then
      raise exception 'La compensación supera el importe respaldado por los comprobantes.';
    end if;
  else raise exception 'Forma de reintegro inválida.';
  end if;

  result:=public.persist_special_financial_operation(p_actor,p_key,p_input,jsonb_build_object('lines',lines));
  perform set_config('zono.special_write','on',true);
  update financial_operations set detail=detail||jsonb_build_object('withdrawal_reference',source.reference,
    'withdrawal_counterparty',source.counterparty,'withdrawal_currency',source.currency)
    where id=(result->>'operation_id')::uuid;
  perform set_config('zono.special_write','off',true);
  return result;
end
$$;

create or replace function public.guard_partner_reimbursement_source()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare source_id uuid;
begin
  if tg_op='INSERT' then
    source_id:=new.reversal_of_transaction_id;
    if source_id is null then return new; end if;
  elsif tg_op='DELETE' then
    source_id:=old.id;
  elsif tg_table_name='financial_operations' then
    if new.status is not distinct from old.status then return new; end if;
    source_id:=old.id;
  else
    if (new.amount,new.currency,new.type,new.category,new.created_at,new.operation_id)
      is not distinct from (old.amount,old.currency,old.type,old.category,old.created_at,old.operation_id) then return new; end if;
    source_id:=old.id;
  end if;
  if exists (select 1 from financial_operations o where o.status='posted' and o.operation_type='partner_equity'
    and o.detail#>>'{input,action}'='reimbursement' and o.detail#>>'{input,resource_id}'=source_id::text) then
    raise exception 'La extracción tiene reintegros vigentes. Anulalos antes de corregirla.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists guard_partner_reimbursement_operation on public.financial_operations;
create trigger guard_partner_reimbursement_operation before update of status or delete on public.financial_operations
  for each row execute function public.guard_partner_reimbursement_source();
drop trigger if exists guard_partner_reimbursement_movement on public.cash_transactions;
create trigger guard_partner_reimbursement_movement before insert or delete or update of amount,currency,type,category,created_at,operation_id
  on public.cash_transactions for each row execute function public.guard_partner_reimbursement_source();

revoke all on function public.partner_withdrawal_balances(uuid,text),public.persist_partner_reimbursement(uuid,uuid,jsonb),
  public.guard_partner_reimbursement_source() from public,anon,authenticated;
grant execute on function public.partner_withdrawal_balances(uuid,text),public.persist_partner_reimbursement(uuid,uuid,jsonb)
  to service_role;
notify pgrst, 'reload schema';
commit;
