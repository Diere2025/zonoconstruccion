-- Pending choices come exclusively from Chequeo de Pagos, scoped by account and receipt day.
begin;
create or replace function public.bank_statement_order_choices(p_actor uuid,p_batch uuid,p_entry uuid,p_day date default null,p_search text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;mp text;items jsonb;day date;
begin
 if not (can_manage_financial_operations(p_actor) or can_manage_treasury_settlements(p_actor)) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select * into strict b from bank_import_batches where id=p_batch;if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 select * into strict e from bank_statement_entries where id=p_entry;
 if not exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=e.id and r.result='valid') or not bank_statement_is_collection(e.id) then raise exception 'Fila ajena o no es una cobranza.';end if;
 day:=coalesce(p_day,e.effective_date);select m.mp_account_id into mp from bank_statement_mp_accounts m join mp_accounts a on a.id=m.mp_account_id and a.is_active where m.financial_account_id=b.financial_account_id;
 if nullif(trim(p_search),'') is not null then
  if length(trim(p_search)) not between 2 and 80 then raise exception 'Ingresá de 2 a 80 caracteres del código.';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into items from (
   select o.id,coalesce(o.legacy_code,o.id::text) code,o.customer_name customer,o.order_date,null::text payment_id,null::text payment_amount
   from orders o where position(lower(trim(p_search)) in lower(coalesce(o.legacy_code,'')))>0
   and lower(coalesce(o.status,'')) not in ('cancelado','cancelada','anulado','anulada','eliminado','eliminada') order by o.order_date desc nulls last,o.id limit 50) x;
 else
  with pending_payments as (select p.id,p.amount,bank_statement_mp_order(p.id) order_id from mp_payments p where p.account_id=mp and p.is_verified is true
    and not coalesce(p.is_hidden,false) and not coalesce(p.is_internal,false)
    and p.received_at >= day::timestamp at time zone 'America/Argentina/Buenos_Aires' and p.received_at < (day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
    and not exists(select 1 from bank_statement_order_links l where l.payment_id=p.id)), grouped as (
    select order_id,count(*) n,min(id) pid,min(amount)::text amount,count(*) filter(where amount=e.signed_amount) exact_count,min(id) filter(where amount=e.signed_amount) exact_id from pending_payments where order_id is not null group by order_id)
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into items from (
   select o.id,coalesce(o.legacy_code,o.id::text) code,o.customer_name customer,o.order_date,case when g.exact_count=1 then g.exact_id end payment_id,case when g.n=1 then g.amount end payment_amount
   from orders o join grouped g on g.order_id=o.id
   where lower(coalesce(o.status,'')) not in ('cancelado','cancelada','anulado','anulada','eliminado','eliminada')
   order by o.order_date desc nulls last,o.id limit 100) x;
 end if;
 return items;
end;
$$;

revoke all on function public.bank_statement_order_choices(uuid,uuid,uuid,date,text) from public,anon,authenticated;
grant execute on function public.bank_statement_order_choices(uuid,uuid,uuid,date,text) to service_role;
commit;
