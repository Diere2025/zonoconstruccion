-- Keep future payments normalized as soon as Treasury records an explicit LOG.
-- Never create a cash payment, change its amounts, or replace an existing association.
begin;
create or replace function public.link_explicit_logistics_freight_movement()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare codes text[]; target uuid;
begin
 if new.type is distinct from 'egreso' or new.currency is distinct from 'ARS' or coalesce(new.amount,0)<=0 or new.reversal_of_transaction_id is not null
  or not (lower(trim(coalesce(new.category,'')))='servicio de flete' or lower(trim(coalesce(new.sub_category,'')))='servicio de flete') then return new;end if;
 if exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=new.id) then return new;end if;
 codes=array(select distinct m[1] from regexp_matches(upper(coalesce(new.notes,'')),'\m(LOG_REC_[0-9]+[A-Z]?)\M','g') m);
 if cardinality(codes)<>1 then return new;end if;
 select id into target from logistics_dispatches where code=codes[1];
 if target is not null then
  insert into logistics_dispatch_movements(transaction_id,dispatch_id,method,purpose)
   values(new.id,target,'movement_log_reference','freight_fee') on conflict(transaction_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function public.link_explicit_logistics_freight_movement() from public,anon,authenticated;
grant execute on function public.link_explicit_logistics_freight_movement() to service_role;
drop trigger if exists link_explicit_logistics_freight_movement on public.cash_transactions;
create trigger link_explicit_logistics_freight_movement
 after insert or update of notes,category,sub_category,type,currency,amount on public.cash_transactions
 for each row execute function public.link_explicit_logistics_freight_movement();
commit;
