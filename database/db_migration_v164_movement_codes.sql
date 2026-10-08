begin;
create sequence if not exists public.cash_movement_code_seq;
alter table public.cash_transactions add column if not exists movement_code text;
create or replace function public.assign_cash_movement_code()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_number text;
begin
  if tg_op='UPDATE' and old.movement_code is not null then
    new.movement_code:=old.movement_code;
  elsif tg_op='INSERT' or new.movement_code is null then
    v_number:=nextval('public.cash_movement_code_seq')::text;
    new.movement_code:=(case when new.type='ingreso' then 'COB-' else 'PAG-' end)
      || lpad(v_number,greatest(10,length(v_number)),'0');
  end if;
  return new;
end;
$$;
drop trigger if exists assign_cash_movement_code on public.cash_transactions;
create trigger assign_cash_movement_code before insert or update on public.cash_transactions
for each row execute function public.assign_cash_movement_code();
update public.cash_transactions set movement_code=null where movement_code is null;
alter table public.cash_transactions alter column movement_code set not null;
create unique index if not exists cash_movement_code_uidx on public.cash_transactions(movement_code);
notify pgrst, 'reload schema';
commit;
