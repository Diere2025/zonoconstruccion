-- Immutable evidence from activation onward. Earlier mutable history is not reconstructed.
begin;
create table public.supplier_account_timeline (
 id bigint generated always as identity primary key,supplier_id uuid not null references suppliers(id),
 entity_key text not null,entity_kind text not null check(entity_kind in ('start','history','purchase','payment')),
 before_value jsonb,after_value jsonb,event_kind text not null,recorded_at timestamptz not null default clock_timestamp(),
 effective_date date not null default (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date
);
create index supplier_timeline_lookup on supplier_account_timeline(supplier_id,entity_key,id desc);
create table public.supplier_timeline_activation(singleton boolean primary key default true check(singleton),activated_at timestamptz not null default clock_timestamp());
insert into supplier_timeline_activation values(true,clock_timestamp());
alter table supplier_account_timeline enable row level security;
alter table supplier_timeline_activation enable row level security;
revoke all on supplier_account_timeline,supplier_timeline_activation from public,anon,authenticated;
grant select on supplier_account_timeline,supplier_timeline_activation to service_role;
create function public.supplier_timeline_entry(p_kind text,p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select case when p_kind='start' then (select to_jsonb(s) from supplier_account_starts s where s.supplier_id=p_id)
 when p_kind='purchase' then (select to_jsonb(p)||jsonb_build_object('entry_date',(coalesce(p.purchase_date,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date) from supplier_purchases p where p.id=p_id)
 when p_kind='payment' then (select to_jsonb(p)||jsonb_build_object('entry_date',(coalesce(c.created_at,p.created_at) at time zone 'America/Argentina/Buenos_Aires')::date) from supplier_payments p left join cash_transactions c on c.id=p.cash_transaction_id where p.id=p_id) end
$$;
create function public.record_supplier_timeline() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text;key text;value jsonb;before_value jsonb;supplier uuid;ref uuid;old_supplier uuid;r record;
begin
 if tg_table_name='cash_transactions' then
  if new.created_at is not distinct from old.created_at then return null;end if;
  for r in select id,supplier_id from supplier_payments where cash_transaction_id=new.id loop
   insert into supplier_account_timeline(supplier_id,entity_key,entity_kind,after_value,event_kind)
   values(r.supplier_id,'payment:'||r.id,'payment',supplier_timeline_entry('payment',r.id),'cash_date');
  end loop;return null;
 end if;
 kind:=case tg_table_name when 'supplier_account_starts' then 'start' when 'supplier_account_history' then 'history' when 'supplier_purchases' then 'purchase' else 'payment' end;
 supplier:=coalesce(new.supplier_id,old.supplier_id);old_supplier:=old.supplier_id;
 if kind='history' then key:='history:'||coalesce(new.source,old.source)||':'||coalesce(new.source_id,old.source_id);value:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 else
  if kind='start' then ref:=supplier;else ref:=coalesce(new.id,old.id);end if;
  key:=kind||':'||ref;value:=case when tg_op='DELETE' then null else supplier_timeline_entry(kind,ref) end;
 end if;
 before_value:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 if tg_op='UPDATE' and supplier is distinct from old_supplier then
  insert into supplier_account_timeline(supplier_id,entity_key,entity_kind,before_value,after_value,event_kind) values(old_supplier,key,kind,before_value,null,'moved');
 end if;
 insert into supplier_account_timeline(supplier_id,entity_key,entity_kind,before_value,after_value,event_kind) values(supplier,key,kind,before_value,value,lower(tg_op));
 return null;
end $$;
create trigger supplier_timeline_purchase after insert or update or delete on supplier_purchases for each row execute function record_supplier_timeline();
create trigger supplier_timeline_payment after insert or update or delete on supplier_payments for each row execute function record_supplier_timeline();
create trigger supplier_timeline_start after insert or update or delete on supplier_account_starts for each row execute function record_supplier_timeline();
create trigger supplier_timeline_history after insert or update or delete on supplier_account_history for each row execute function record_supplier_timeline();
create trigger supplier_timeline_cash_date after update of created_at on cash_transactions for each row execute function record_supplier_timeline();
-- Baseline is a snapshot of what is known at activation, not proof of earlier balances.
select pg_advisory_xact_lock(hashtextextended('financial_operations_write',0));
insert into supplier_account_timeline(supplier_id,entity_key,entity_kind,after_value,event_kind)
 select supplier_id,'start:'||supplier_id,'start',supplier_timeline_entry('start',supplier_id),'baseline' from supplier_account_starts
 union all select supplier_id,'history:'||source||':'||source_id,'history',to_jsonb(h),'baseline' from supplier_account_history h
 union all select supplier_id,'purchase:'||id,'purchase',supplier_timeline_entry('purchase',id),'baseline' from supplier_purchases
 union all select supplier_id,'payment:'||id,'payment',supplier_timeline_entry('payment',id),'baseline' from supplier_payments;
create function public.get_supplier_recorded_state(p_supplier uuid,p_day date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare activated timestamptz;result jsonb;
begin
 select activated_at into activated from supplier_timeline_activation;
 if p_day is null or p_day<(activated at time zone 'America/Argentina/Buenos_Aires')::date or p_day>(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'La consulta registrada solo está disponible desde la activación y hasta hoy.';end if;
 select jsonb_build_object('coverageFrom',(activated at time zone 'America/Argentina/Buenos_Aires')::date,'recordedThrough',p_day,
 'states',coalesce(jsonb_agg(jsonb_build_object('key',entity_key,'kind',entity_kind,'value',after_value) order by entity_key),'[]')) into result
 from (select distinct on(entity_key) entity_key,entity_kind,after_value from supplier_account_timeline where supplier_id=p_supplier
  and recorded_at<((p_day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires') order by entity_key,id desc)t;
 return result;
end $$;
revoke all on function supplier_timeline_entry(text,uuid),record_supplier_timeline(),get_supplier_recorded_state(uuid,date) from public,anon,authenticated;
grant execute on function supplier_timeline_entry(text,uuid),record_supplier_timeline(),get_supplier_recorded_state(uuid,date) to service_role;
notify pgrst,'reload schema';
commit;
