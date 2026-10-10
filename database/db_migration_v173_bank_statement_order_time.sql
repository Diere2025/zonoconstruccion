begin;
-- MP workbook clock values marked Z match the MP DOM wall clock. Preserve source timestamps;
-- compare only this known DOM origin by its Buenos Aires clock. Other origins use true instants.
create or replace function public.bank_statement_payment_minute_matches(p_entry uuid,p_payment text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select date_trunc('minute',e.occurred_at at time zone 'UTC') =
  case when left(p.id,length(p.account_id||'_mp_dom_'))=p.account_id||'_mp_dom_'
   then date_trunc('minute',p.received_at at time zone 'America/Argentina/Buenos_Aires')
   else date_trunc('minute',p.received_at at time zone 'UTC') end
 from bank_statement_entries e join mp_payments p on p.id=p_payment where e.id=p_entry),false)
$$;
create or replace function public.sync_bank_statement_orders(p_actor uuid,p_batch uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;p mp_payments;mp text;pid text;oid uuid;n integer;reciprocal integer;linked integer:=0;method text;has_exact boolean;has_minute boolean;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 select m.mp_account_id into mp from bank_statement_mp_accounts m join mp_accounts a on a.id=m.mp_account_id and a.is_active where m.financial_account_id=b.financial_account_id;
 if mp is null then return jsonb_build_object('linked',0,'reason','Configurar cuenta de Chequeo de Pagos');end if;
 for e in select x.* from bank_statement_entries x where exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=x.id and r.result='valid')
 and bank_statement_is_collection(x.id) and not exists(select 1 from bank_statement_order_links l where l.entry_id=x.id) order by x.id for update loop
  select exists(select 1 from mp_payments q where q.account_id=mp and q.id in (mp||'_'||e.related_operation_id,mp||'_'||e.external_movement_id)) into has_exact;
  select exists(select 1 from mp_payments q where q.account_id=mp and q.amount=e.signed_amount
   and q.is_verified is true and not coalesce(q.is_hidden,false) and not coalesce(q.is_internal,false)
   and bank_statement_payment_minute_matches(e.id,q.id)) into has_minute;
  method:=case when has_exact then 'operation' when has_minute then 'source_minute' else 'unique_amount_day' end;
  select count(*),min(q.id) into n,pid from mp_payments q where q.account_id=mp and q.amount=e.signed_amount
   and q.is_verified is true and not coalesce(q.is_hidden,false) and not coalesce(q.is_internal,false)
   and (q.received_at at time zone 'America/Argentina/Buenos_Aires')::date between e.effective_date-1 and e.effective_date
   and (not has_exact or q.id in (mp||'_'||e.related_operation_id,mp||'_'||e.external_movement_id))
   and (has_exact or not has_minute or bank_statement_payment_minute_matches(e.id,q.id));
  if n<>1 then continue;end if;
  select * into strict p from mp_payments where id=pid for update;
  if p.account_id<>mp or p.amount<>e.signed_amount or p.is_verified is not true or coalesce(p.is_hidden,false) or coalesce(p.is_internal,false)
   or (p.received_at at time zone 'America/Argentina/Buenos_Aires')::date not between e.effective_date-1 and e.effective_date then continue;end if;
  if not has_exact and has_minute and not bank_statement_payment_minute_matches(e.id,pid) then continue;end if;
  oid:=bank_statement_mp_order(pid);if oid is null or exists(select 1 from bank_statement_order_links where payment_id=pid) then continue;end if;
  -- Reciprocal uniqueness includes all active extracts, even unclassified or already resolved collections.
  select count(*) into reciprocal from bank_statement_entries x where x.financial_account_id=e.financial_account_id and x.signed_amount=e.signed_amount
   and bank_statement_is_collection(x.id) and exists(select 1 from bank_import_batch_rows r join bank_import_batches z on z.id=r.batch_id where r.entry_id=x.id and r.result='valid' and z.deleted_at is null)
   and (p.received_at at time zone 'America/Argentina/Buenos_Aires')::date between x.effective_date-1 and x.effective_date
   and (not has_exact or pid in (mp||'_'||x.related_operation_id,mp||'_'||x.external_movement_id))
   and (has_exact or not has_minute or bank_statement_payment_minute_matches(x.id,pid));
  if reciprocal<>1 then continue;end if;
  perform 1 from orders where id=oid for update;if bank_statement_mp_order(pid) is distinct from oid then continue;end if;
  insert into bank_statement_order_links(entry_id,order_id,payment_id,kind,method,linked_by) values(e.id,oid,pid,'automatic',method,p_actor);
  insert into bank_statement_events(batch_id,entry_id,action,after_value,actor_id) values(b.id,e.id,'order.auto_linked',jsonb_build_object('order',oid,'payment',pid,'method',method),p_actor);linked:=linked+1;
 end loop;
 return jsonb_build_object('linked',linked);
end;
$$;

revoke all on function public.bank_statement_payment_minute_matches(uuid,text),public.sync_bank_statement_orders(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bank_statement_payment_minute_matches(uuid,text),public.sync_bank_statement_orders(uuid,uuid) to service_role;
commit;
