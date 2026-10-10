begin;
create table if not exists public.bank_statement_mp_accounts (
 financial_account_id uuid primary key references public.financial_accounts(id),
 mp_account_id text not null unique references public.mp_accounts(id),
 version integer not null default 1,updated_by uuid references auth.users(id),updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.bank_statement_order_links (
 entry_id uuid primary key references public.bank_statement_entries(id),order_id uuid references public.orders(id),
 payment_id text unique references public.mp_payments(id) on delete set null,kind text not null check(kind in ('automatic','manual')),
 method text not null,version integer not null default 1,linked_by uuid not null references auth.users(id),linked_at timestamptz not null default clock_timestamp()
);
create index if not exists bank_statement_order_links_order_idx on public.bank_statement_order_links(order_id);
alter table public.bank_statement_mp_accounts enable row level security;
alter table public.bank_statement_order_links enable row level security;
revoke all on public.bank_statement_mp_accounts,public.bank_statement_order_links from public,anon,authenticated;
grant all on public.bank_statement_mp_accounts,public.bank_statement_order_links to service_role;
create or replace function public.bank_statement_is_collection(p_entry uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select e.signed_amount>0 and case when e.financial_concept_id is null then lower(trim(e.description)) in ('cobro','ingreso de dinero','dinero recibido')
 else lower(trim(c.concept))='cobro' and lower(trim(c.category)) in ('recaudación','recaudacion') end
 from bank_statement_entries e left join financial_concepts c on c.id=e.financial_concept_id where e.id=p_entry),false)
$$;
create or replace function public.bank_statement_mp_order(p_payment text)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select case when count(*)=1 then min(o.id::text)::uuid else null end
 from mp_payments p join orders o on
 (p.order_id=o.id and (nullif(trim(p.order_code),'') is null or lower(trim(p.order_code))=lower(trim(o.legacy_code))))
 or (p.order_id is null and nullif(trim(p.order_code),'') is not null and lower(trim(p.order_code))=lower(trim(o.legacy_code)))
 where p.id=p_payment and lower(coalesce(o.status,'')) not in ('cancelado','cancelada','anulado','anulada','eliminado','eliminada')
$$;
create or replace function public.save_bank_statement_mp_account(p_actor uuid,p_account uuid,p_mp text,p_version integer default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare previous bank_statement_mp_accounts;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 perform 1 from financial_accounts where id=p_account and is_active and currency='ARS' and type in ('banco','virtual') and name ~* '^Cuenta[. ]MP([0-9]+|Caro)$' for update;if not found then raise exception 'Cuenta bancaria no disponible.';end if;
 select * into previous from bank_statement_mp_accounts where financial_account_id=p_account for update;
 if found then if previous.version is distinct from p_version then raise exception 'La asociación cambió. Actualizá.' using errcode='40001';end if;
 elsif p_version is not null then raise exception 'La asociación ya no existe.' using errcode='40001';end if;
 if p_mp is null then delete from bank_statement_mp_accounts where financial_account_id=p_account;
 else
  perform 1 from mp_accounts where id=p_mp and is_active for update;if not found then raise exception 'Cuenta de Chequeo de Pagos no disponible.';end if;
  insert into bank_statement_mp_accounts(financial_account_id,mp_account_id,updated_by) values(p_account,p_mp,p_actor)
  on conflict(financial_account_id) do update set mp_account_id=excluded.mp_account_id,version=bank_statement_mp_accounts.version+1,updated_by=p_actor,updated_at=clock_timestamp();
 end if;
 insert into bank_statement_events(action,before_value,after_value,actor_id) values('mp_account.saved',to_jsonb(previous),jsonb_build_object('account',p_account,'mp',p_mp),p_actor);
end;
$$;
create or replace function public.sync_bank_statement_orders(p_actor uuid,p_batch uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;p mp_payments;mp text;pid text;oid uuid;n integer;reciprocal integer;linked integer:=0;method text;has_exact boolean;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 select m.mp_account_id into mp from bank_statement_mp_accounts m join mp_accounts a on a.id=m.mp_account_id and a.is_active where m.financial_account_id=b.financial_account_id;
 if mp is null then return jsonb_build_object('linked',0,'reason','Configurar cuenta de Chequeo de Pagos');end if;
 for e in select x.* from bank_statement_entries x where exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=x.id and r.result='valid')
 and bank_statement_is_collection(x.id) and not exists(select 1 from bank_statement_order_links l where l.entry_id=x.id) order by x.id for update loop
  select exists(select 1 from mp_payments q where q.account_id=mp and q.id in (mp||'_'||e.related_operation_id,mp||'_'||e.external_movement_id)) into has_exact;
  method:=case when has_exact then 'operation' else 'unique_amount_day' end;
  select count(*),min(q.id) into n,pid from mp_payments q where q.account_id=mp and q.amount=e.signed_amount
   and q.is_verified is true and not coalesce(q.is_hidden,false) and not coalesce(q.is_internal,false)
   and (q.received_at at time zone 'America/Argentina/Buenos_Aires')::date between e.effective_date-1 and e.effective_date
   and (not has_exact or q.id in (mp||'_'||e.related_operation_id,mp||'_'||e.external_movement_id));
  if n<>1 then continue;end if;
  select * into strict p from mp_payments where id=pid for update;
  if p.account_id<>mp or p.amount<>e.signed_amount or p.is_verified is not true or coalesce(p.is_hidden,false) or coalesce(p.is_internal,false)
   or (p.received_at at time zone 'America/Argentina/Buenos_Aires')::date not between e.effective_date-1 and e.effective_date then continue;end if;
  oid:=bank_statement_mp_order(pid);if oid is null or exists(select 1 from bank_statement_order_links where payment_id=pid) then continue;end if;
  -- Reciprocal uniqueness includes all active extracts, even unclassified or already resolved collections.
  select count(*) into reciprocal from bank_statement_entries x where x.financial_account_id=e.financial_account_id and x.signed_amount=e.signed_amount
   and bank_statement_is_collection(x.id) and exists(select 1 from bank_import_batch_rows r join bank_import_batches z on z.id=r.batch_id where r.entry_id=x.id and r.result='valid' and z.deleted_at is null)
   and (p.received_at at time zone 'America/Argentina/Buenos_Aires')::date between x.effective_date-1 and x.effective_date
   and (not has_exact or pid in (mp||'_'||x.related_operation_id,mp||'_'||x.external_movement_id));
  if reciprocal<>1 then continue;end if;
  perform 1 from orders where id=oid for update;if bank_statement_mp_order(pid) is distinct from oid then continue;end if;
  insert into bank_statement_order_links(entry_id,order_id,payment_id,kind,method,linked_by) values(e.id,oid,pid,'automatic',method,p_actor);
  insert into bank_statement_events(batch_id,entry_id,action,after_value,actor_id) values(b.id,e.id,'order.auto_linked',jsonb_build_object('order',oid,'payment',pid,'method',method),p_actor);linked:=linked+1;
 end loop;
 return jsonb_build_object('linked',linked);
end;
$$;
create or replace function public.link_bank_statement_order(p_actor uuid,p_batch uuid,p_entry uuid,p_order uuid,p_payment text default null,p_version integer default 0)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;e bank_statement_entries;previous bank_statement_order_links;mp text;p mp_payments;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;
 if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 select * into strict e from bank_statement_entries where id=p_entry for update;
 if not exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=e.id and r.result='valid') or e.financial_account_id<>b.financial_account_id then raise exception 'Fila ajena o en conflicto.';end if;
 select * into previous from bank_statement_order_links where entry_id=e.id for update;
 if coalesce(previous.version,0) is distinct from p_version then raise exception 'El vínculo cambió. Actualizá.' using errcode='40001';end if;
 if p_order is null then
  if previous.entry_id is null or previous.order_id is null then raise exception 'No hay vínculo que quitar.';end if;
  update bank_statement_order_links set order_id=null,payment_id=null,kind='manual',method='declined',version=version+1,linked_by=p_actor,linked_at=clock_timestamp() where entry_id=e.id;
 else
  if not bank_statement_is_collection(e.id) then raise exception 'Solo se vinculan filas de cobranzas.';end if;
  perform 1 from orders where id=p_order and lower(coalesce(status,'')) not in ('cancelado','cancelada','anulado','anulada','eliminado','eliminada') for update;if not found then raise exception 'Pedido no disponible.';end if;
  if p_payment is not null then
   select m.mp_account_id into mp from bank_statement_mp_accounts m join mp_accounts a on a.id=m.mp_account_id and a.is_active where m.financial_account_id=b.financial_account_id;
   select * into strict p from mp_payments where id=p_payment for update;
   if mp is null or p.account_id<>mp or p.amount<>e.signed_amount or p.is_verified is not true or coalesce(p.is_hidden,false) or coalesce(p.is_internal,false)
    or bank_statement_mp_order(p.id) is distinct from p_order then raise exception 'El cobro de Chequeo de Pagos no coincide con el pedido, la cuenta o el importe.';end if;
  end if;
  insert into bank_statement_order_links(entry_id,order_id,payment_id,kind,method,linked_by) values(e.id,p_order,p_payment,'manual','manual',p_actor)
  on conflict(entry_id) do update set order_id=excluded.order_id,payment_id=excluded.payment_id,kind='manual',method='manual',version=bank_statement_order_links.version+1,linked_by=p_actor,linked_at=clock_timestamp();
 end if;
 insert into bank_statement_events(batch_id,entry_id,action,before_value,after_value,actor_id) values(b.id,e.id,case when p_order is null then 'order.unlinked' else 'order.manually_linked' end,to_jsonb(previous),jsonb_build_object('order',p_order,'payment',p_payment),p_actor);
end;
$$;
create index if not exists bank_statement_collection_lookup_idx on public.bank_statement_entries(financial_account_id,signed_amount,effective_date) where signed_amount>0;
create index if not exists bank_statement_mp_payment_lookup_idx on public.mp_payments(account_id,amount,received_at);
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
   from orders o left join grouped g on g.order_id=o.id
   where lower(coalesce(o.status,'')) not in ('cancelado','cancelada','anulado','anulada','eliminado','eliminada')
   and (g.order_id is not null or ((o.order_date=day or (o.order_date is null and (o.created_at at time zone 'America/Argentina/Buenos_Aires')::date=day))
    and not exists(select 1 from bank_statement_order_links l join bank_statement_entries s on s.id=l.entry_id where l.order_id=o.id and s.financial_account_id=e.financial_account_id and s.effective_date=day)))
   order by o.order_date desc nulls last,o.id limit 100) x;
 end if;
 return items;
end;
$$;
insert into public.bank_statement_mp_accounts(financial_account_id,mp_account_id)
 select min(a.id::text)::uuid,seed.mp from (values ('MP3','diegozono_mp'),('MP4','pagoszono_26'),('MP5','cesara_daiana_010_mp')) seed(account,mp)
 join financial_accounts a on a.name ~* ('^Cuenta[. ]'||seed.account||'$') and a.is_active and a.currency='ARS' and a.type in ('banco','virtual')
 join mp_accounts m on m.id=seed.mp and m.is_active group by seed.mp having count(*)=1 on conflict do nothing;
do $$ declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('bank_statement_is_collection','bank_statement_mp_order','save_bank_statement_mp_account','sync_bank_statement_orders','link_bank_statement_order','bank_statement_order_choices') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
