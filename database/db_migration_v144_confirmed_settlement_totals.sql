begin;

-- Metadata writes and delivery synchronization must retain confirmed balances.
-- Reopening only changes status; the next explicit draft save can recalculate.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.recalculate_treasury_settlement_electronic_total()'::regprocedure) into definition;
  if position('if old.status = ''confirmed'' then return new; end if;' in definition) = 0 then
    if position('if new.status = ''archived''' in definition) = 0 then
      raise exception 'No se pudo localizar la protección del cálculo de rendiciones.';
    end if;
    execute replace(definition, 'if new.status = ''archived''',
      'if old.status = ''confirmed'' then return new; end if; if new.status = ''archived''');
  end if;
end;
$$;

create or replace function public.guard_confirmed_settlement_totals()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'confirmed' and (
    new.deliveries_total, new.electronic_total, new.change_fund,
    new.shortage_recovered, new.tolls_total, new.extraordinary_total,
    new.counted_cash, new.expected_cash, new.difference
  ) is distinct from (
    old.deliveries_total, old.electronic_total, old.change_fund,
    old.shortage_recovered, old.tolls_total, old.extraordinary_total,
    old.counted_cash, old.expected_cash, old.difference
  ) then
    raise exception 'Reabrí la rendición antes de modificar sus importes.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists treasury_settlement_z_confirmed_totals on public.treasury_settlements;
create trigger treasury_settlement_z_confirmed_totals before update on public.treasury_settlements
  for each row execute function public.guard_confirmed_settlement_totals();

notify pgrst, 'reload schema';
commit;
