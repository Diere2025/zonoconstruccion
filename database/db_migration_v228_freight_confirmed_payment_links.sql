begin;
-- INC-005177: a LOG mentioned in notes is evidence, not a payment allocation.
-- New freight payments use pay_logistics_freight / allocate_logistics_freight_payment.
drop trigger if exists link_explicit_logistics_freight_movement on public.cash_transactions;

create or replace function public.guard_confirmed_logistics_payment_links()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Also protects against an older importer or reference migration being rerun.
 if new.method='movement_log_reference' then
  if TG_OP='INSERT' then return null; end if;
  if new.dispatch_id is distinct from old.dispatch_id or new.method is distinct from old.method then
   raise exception 'Las notas no confirman la imputación de un pago. Revisá el vínculo o el desglose.';
  end if;
 end if;
 if new.method in ('source_row_unique','source_verified') and exists(
  select 1 from logistics_freight_payment_allocations a where a.transaction_id=new.transaction_id
 ) then
  if TG_OP='UPDATE' and new.dispatch_id=old.dispatch_id and new.method=old.method then return old; end if;
  raise exception 'El pago ya tiene un desglose confirmado. Revisá sus imputaciones antes de conciliar.';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_confirmed_logistics_payment_links() from public,anon,authenticated;
grant execute on function public.guard_confirmed_logistics_payment_links() to service_role;
drop trigger if exists guard_confirmed_logistics_payment_links on public.logistics_dispatch_movements;
create trigger guard_confirmed_logistics_payment_links before insert or update on public.logistics_dispatch_movements
for each row execute function public.guard_confirmed_logistics_payment_links();
notify pgrst,'reload schema';
commit;
