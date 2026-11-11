begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtextextended('bank_statement_commit', 0));

-- Preserve the current posting and reserve-matching logic.
do $$
declare
  target record;
  definition text;
begin
  for target in select * from (values
    ('public.sync_mp_bank_inbox_before_v189(text,uuid)',
     $old$target_name<>'MP - Intereses Ganados' or lower(category)='inversiones'$old$,
     $new$target_name<>'MP - Intereses Ganados' or lower(category)='intereses ganados'$new$),
    ('public.sync_mp_reserve_ledger(text)',
     $old$category=case when r.kind='yield' then 'Inversiones' else 'Movimiento de cuentas' end$old$,
     $new$category=case when r.kind='yield' then 'Intereses ganados' else 'Movimiento de cuentas' end$new$)
  ) as functions(signature, previous, updated)
  loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    if position(target.previous in definition) > 0 then
      execute replace(definition, target.previous, target.updated);
    elsif position(target.updated in definition) = 0 then
      raise exception 'Definición inesperada de %', target.signature;
    end if;
  end loop;
end $$;

do $$
declare
  legacy financial_concepts;
  category_key uuid;
  concept_key uuid;
begin
  select * into strict legacy from financial_concepts
  where is_active and concept = 'MP - Intereses Ganados' for update;
  if legacy.category not in ('Inversiones', 'Intereses ganados') then
    raise exception 'Categoría inesperada del concepto de MercadoPago.';
  end if;

  insert into financial_classification_items(kind, name, movement_type)
  values ('category', 'Intereses ganados', 'Ingreso') on conflict do nothing;
  select id into strict category_key from financial_classification_items
  where kind = 'category' and lower(trim(name)) = 'intereses ganados' and is_active;

  insert into financial_classification_items(kind, name, category_id, movement_type)
  values ('concept', legacy.concept, category_key, 'Ingreso') on conflict do nothing;
  select id into strict concept_key from financial_classification_items
  where kind = 'concept' and name = legacy.concept and category_id = category_key and is_active;

  update financial_concepts set category = 'Intereses ganados', sub_category = 'Intereses ganados',
    efe_category = 'Intereses ganados', movement_type = 'Ingreso'
  where id = legacy.id and (category, sub_category, efe_category, movement_type)
    is distinct from ('Intereses ganados', 'Intereses ganados', 'Intereses ganados', 'Ingreso');

  update financial_classification_items set concept_id = concept_key, movement_type = 'Ingreso',
    efe_category = 'Intereses ganados', version = version + 1, updated_at = clock_timestamp()
  where kind = 'preset' and legacy_concept_id = legacy.id
    and (concept_id, movement_type, efe_category) is distinct from (concept_key, 'Ingreso', 'Intereses ganados');

  -- The existing association keeps its ID. Cover official statement wording in older clients too.
  insert into bank_classification_rules(provider, description, direction, financial_concept_id, created_by, association_group, display_name)
  select provider, 'rendimiento positivo de la inversion', direction, financial_concept_id, created_by, association_group,
    'Rendimiento positivo de la inversión'
  from bank_classification_rules
  where provider = 'mercadopago' and financial_account_id is null and is_active
    and description = 'rendimiento bruto' and direction = 'ingreso' and financial_concept_id = legacy.id
    and not exists (
      select 1 from bank_classification_rules existing
      where existing.provider = 'mercadopago' and existing.financial_account_id is null
        and existing.description = 'rendimiento positivo de la inversion' and existing.direction = 'ingreso'
    )
  on conflict do nothing;
end $$;

-- Select exact MercadoPago interest credits and the reversals linked to them.
create temporary table mp_interest_reclassification_before on commit drop as
select t.* from cash_transactions t
where t.category = 'Inversiones' and (
  (t.type = 'ingreso' and t.reversal_of_transaction_id is null and lower(trim(t.concept)) = 'mp - intereses ganados')
  or exists (
    select 1 from cash_transactions original
    where original.id = t.reversal_of_transaction_id and original.type = 'ingreso'
      and original.category in ('Inversiones', 'Intereses ganados')
      and lower(trim(original.concept)) = 'mp - intereses ganados'
      and t.type = 'egreso' and t.amount = original.amount and t.currency = original.currency
      and t.financial_account_id is not distinct from original.financial_account_id
  )
);

select set_config('zono.financial_write', 'on', true);
update cash_transactions movement
set category = 'Intereses ganados', sub_category = 'Intereses ganados', efe_category = 'Intereses ganados'
from mp_interest_reclassification_before previous where movement.id = previous.id;
select set_config('zono.financial_write', 'off', true);

do $$
declare
  classification text[] := array['category', 'sub_category', 'efe_category'];
begin
  if exists (
    select 1 from mp_interest_reclassification_before previous
    left join cash_transactions movement on movement.id = previous.id
    where movement.category is distinct from 'Intereses ganados'
      or (to_jsonb(movement) - classification) is distinct from (to_jsonb(previous) - classification)
  ) then
    raise exception 'La reclasificación modificó datos fuera de la categoría.';
  end if;
  raise notice 'Intereses de MercadoPago reclasificados: %', (select count(*) from mp_interest_reclassification_before);
end $$;

update financial_operations operation set version = version + 1, updated_at = clock_timestamp()
where exists (select 1 from mp_interest_reclassification_before previous where previous.operation_id = operation.id);

commit;
