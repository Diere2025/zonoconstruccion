begin;

alter table public.crypto_reconciliation_entries
  drop constraint crypto_reconciliation_entries_check,
  add constraint crypto_reconciliation_entries_amount_check check (
    amount < 1e12 and scale(amount) <= 8 and (
      amount > 0 or (
        amount = 0 and (
          kind = 'opening' or
          (kind in ('service', 'redot_ads', 'personal') and original_amount is not null)
        )
      )
    )
  );

create or replace function public.save_bank_grouped_rule(
  p_actor uuid, p_description text, p_direction text, p_concept uuid,
  p_version integer, p_group text, p_name text, p_alias text
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  rid uuid;
  previous bank_classification_rules;
begin
  if not can_manage_financial_operations(p_actor) then
    raise exception 'Sin permiso.' using errcode='42501';
  end if;
  if p_group is null or p_group not in ('common','binance_p2p')
    or length(coalesce(p_name,'')) > 1000 or length(coalesce(p_alias,'')) > 200 then
    raise exception 'Asociación inválida.';
  end if;
  if p_group = 'binance_p2p' and (p_direction <> 'egreso' or not exists (
    select 1 from financial_concepts
    where id = p_concept and is_active and concept = 'Compra de USDT · Binance' and category = 'Compra de USDT'
  )) then
    raise exception 'Binance P2P corresponde a egresos para compra de USDT.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
  select * into previous from bank_classification_rules
    where financial_account_id is null and description = p_description and direction = p_direction and is_active for update;
  rid := save_bank_statement_rule(p_actor,null,p_description,p_direction,p_concept,p_version);
  update bank_classification_rules set association_group=p_group,display_name=nullif(trim(p_name),''),merchant_alias=nullif(trim(p_alias),'')
    where id=rid;
  insert into bank_statement_events(action,before_value,after_value,actor_id)
    values('rule.group',to_jsonb(previous),(select to_jsonb(r) from bank_classification_rules r where r.id=rid),p_actor);
  return rid;
end $$;

do $$
declare
  purchase_concept uuid;
  catalog_category uuid;
  catalog_concept uuid;
  actor uuid;
  movement record;
  charge record;
begin
  perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
  update public.financial_concepts
    set concept='Compra de USDT · Binance', category='Compra de USDT',
      sub_category='Compra de USDT', efe_category='Compra de Moneda Extranjera'
    where concept='Binance - Carga de saldo' and category='Publicidad' and is_active
    returning id into strict purchase_concept;

  insert into public.financial_classification_items(kind,name,movement_type)
    values('category','Compra de USDT','Egreso') on conflict do nothing;
  select id into strict catalog_category from public.financial_classification_items
    where kind='category' and lower(trim(name))='compra de usdt';

  insert into public.financial_classification_items(kind,name,category_id,movement_type,efe_category)
    values('concept','Compra de USDT · Binance',catalog_category,'Egreso','Compra de Moneda Extranjera')
    on conflict do nothing;
  select id into strict catalog_concept from public.financial_classification_items
    where kind='concept' and category_id=catalog_category and lower(trim(name))='compra de usdt · binance';

  update public.financial_classification_items
    set concept_id=catalog_concept, name='Compra de USDT · Binance',
      efe_category='Compra de Moneda Extranjera', version=version+1, updated_at=now()
    where kind='preset' and legacy_concept_id=purchase_concept;

  select created_by into actor
    from public.crypto_reconciliation_entries
    where voided_at is null and public.can_manage_financial_operations(created_by)
    order by created_at desc
    limit 1;
  if actor is null then return; end if;

  for movement in
    select t.id
    from public.cash_transactions t
    where t.created_at >= '2026-10-01T00:00:00-03:00'
      and t.type = 'egreso' and t.reversal_of_transaction_id is null
      and not exists (select 1 from public.cash_transactions r where r.reversal_of_transaction_id = t.id)
      and (
        (t.concept = 'Binance - Carga de saldo' and t.category = 'Publicidad') or
        exists (select 1 from public.crypto_reconciliation_entries e where e.bank_transaction_id = t.id
          and e.kind = 'p2p' and e.voided_at is null)
      )
    order by t.id
  loop
    declare
      current_classification jsonb;
    begin
      current_classification := public.read_movement_classification(actor, movement.id);
      if (current_classification->>'editable')::boolean then
        perform public.correct_movement_classification(actor, movement.id, purchase_concept, current_classification->>'token');
      end if;
    end;
  end loop;

  if not exists (select 1 from public.crypto_reconciliation_entries where reference='RedotPay DigitalOcean 2026-10-01 15:38:57') then
    return;
  end if;
  update public.crypto_reconciliation_entries
    set detail='Carga neta USD 458.60; ' || detail
    where reference='GDT S731.04 Telegram 992186' and day='2026-11-11'
      and kind='ad_funding' and amount=483.90 and credited=657.10 and voided_at is null
      and detail not like 'Carga neta USD %';

  for charge in
    select * from (values
      ('2026-10-27', 'service', 'RedotPay Whaticket 2026-10-27 14:39:10', 9.29, 'CRM y atención comercial'),
      ('2026-10-27', 'service', 'RedotPay OpenAI 2026-10-27', 10.00, 'Software de IA'),
      ('2026-10-31', 'service', 'RedotPay Runway 2026-10-31 20:13:00', 15.00, 'Producción de contenido'),
      ('2026-10-31', 'redot_ads', 'RedotPay TikTok Ads 2026-10-31 18:48:54', 25.00, 'Publicidad TikTok'),
      ('2026-11-02', 'redot_ads', 'RedotPay TikTok Ads 2026-11-02 11:59:10', 25.00, 'Publicidad TikTok'),
      ('2026-11-02', 'service', 'RedotPay DigitalOcean 2026-11-02 10:25:02', 36.32, 'Infraestructura y alojamiento'),
      ('2026-11-03', 'redot_ads', 'RedotPay TikTok Ads 2026-11-03 13:21:08', 25.00, 'Publicidad TikTok')
    ) as imported(day, kind, reference, original_amount, detail)
  loop
    if not exists (select 1 from public.crypto_reconciliation_entries where lower(reference)=lower(charge.reference) and voided_at is null) then
      perform public.save_crypto_reconciliation_entry(actor, md5('zono-redot-pending:' || charge.reference)::uuid,
        jsonb_build_object('day', charge.day, 'kind', charge.kind, 'wallet', 'redot', 'reference', charge.reference,
          'detail', charge.detail, 'amount', 0, 'original_amount', charge.original_amount, 'original_currency', 'USD'));
    end if;
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
