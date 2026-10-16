begin;
create table if not exists public.logistics_freight_novelties (
 id uuid primary key, carrier_id uuid references public.carriers(id), company_key text,
 origin_date date not null, source_dispatch_id uuid references public.logistics_dispatches(id),
 kind text not null check(kind in ('shortage','advance','installment','other')),
 label text not null check(length(trim(label)) between 1 and 300), reference text not null check(length(trim(reference)) between 1 and 500),
 amount numeric(16,2) not null check(amount>0 and amount<=100000000),
 status text not null default 'approved' check(status in ('approved','cancelled')),
 created_by uuid not null, created_at timestamptz not null default now(),
 check((carrier_id is null)<>(company_key is null)),check(company_key is null or company_key in ('gyv','gavaplast'))
);
create table if not exists public.logistics_freight_novelty_applications (
 novelty_id uuid references public.logistics_freight_novelties(id),dispatch_id uuid references public.logistics_freight_settlement_terms(dispatch_id),
 amount numeric(16,2) not null check(amount>0),primary key(novelty_id,dispatch_id)
);
create table if not exists public.logistics_freight_payment_requests (
 actor_id uuid not null,request_key uuid not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_key)
);
do $$declare t text;begin foreach t in array array['logistics_freight_novelties','logistics_freight_novelty_applications','logistics_freight_payment_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end$$;
create or replace function public.logistics_company_for_carrier(p_carrier uuid) returns text language sql stable set search_path=public,pg_temp as $$
 select case when lower(name)~'(^|[^a-z])(gyv|gv)([^a-z]|$)' or lower(name)~'(g[oó]mez.*gustavo|gustavo.*g[oó]mez|ramallo.*jorge|jorge.*ramallo|herrera.*patricio|patricio.*herrera|rostagno.*gast[oó]n|gast[oó]n.*rostagno)' then 'gyv'
 when lower(name)~'(alejandro.*(gavaplast|camm?issa)|camm?issa.*alejandro)' then 'gavaplast' else null end from carriers where id=p_carrier
$$;
create or replace function public.save_logistics_freight_novelty(p_actor uuid,p_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n logistics_freight_novelties; saved logistics_freight_novelties;
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into n from logistics_freight_novelties where id=p_id for update;
 if found then
  if (to_jsonb(n)-'id'-'status'-'created_by'-'created_at')=p_input then return to_jsonb(n);end if;
  raise exception 'La novedad ya existe con otros datos' using errcode='23505';
 end if;
 if nullif(p_input->>'amount','') is null or (p_input->>'amount')::numeric<>round((p_input->>'amount')::numeric,2) then raise exception 'Importe inválido';end if;
 insert into logistics_freight_novelties(id,carrier_id,company_key,origin_date,source_dispatch_id,kind,label,reference,amount,created_by)
 values(p_id,(p_input->>'carrier_id')::uuid,p_input->>'company_key',(p_input->>'origin_date')::date,(p_input->>'source_dispatch_id')::uuid,p_input->>'kind',p_input->>'label',p_input->>'reference',(p_input->>'amount')::numeric,p_actor) returning * into saved;
 insert into logistics_freight_accounting_events(actor_id,kind,new_data) values(p_actor,'novelty_created',to_jsonb(saved));
 return to_jsonb(saved);
end$$;
create or replace function public.sync_logistics_novelty_applications() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb;n logistics_freight_novelties;carrier uuid; used numeric;
begin
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select carrier_id into carrier from logistics_dispatch_plans where dispatch_id=new.dispatch_id;
 delete from logistics_freight_novelty_applications where dispatch_id=new.dispatch_id;
 for d in select value from jsonb_array_elements(new.deductions) where value ? 'noveltyId' loop
  select * into n from logistics_freight_novelties where id=(d->>'noveltyId')::uuid for update;
  if not found or n.status<>'approved' or d->>'kind'<>'offset' or (n.carrier_id is not null and n.carrier_id<>carrier)
   or (n.company_key is not null and n.company_key is distinct from logistics_company_for_carrier(carrier)) then raise exception 'La novedad no corresponde al responsable';end if;
  select coalesce(sum(amount),0) into used from logistics_freight_novelty_applications where novelty_id=n.id;
  if used+(d->>'amount')::numeric>n.amount then raise exception 'El descuento supera el saldo de la novedad';end if;
  insert into logistics_freight_novelty_applications values(n.id,new.dispatch_id,(d->>'amount')::numeric);
 end loop;
 return new;
end$$;
drop trigger if exists logistics_novelty_applications_guard on public.logistics_freight_settlement_terms;
create trigger logistics_novelty_applications_guard after insert or update on public.logistics_freight_settlement_terms for each row execute function sync_logistics_novelty_applications();
create or replace function public.guard_allocated_freight_cash() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from logistics_freight_payment_allocations where transaction_id=old.id) and (tg_op='DELETE' or new.amount is distinct from old.amount or new.currency is distinct from old.currency or new.type is distinct from old.type) then raise exception 'Este pago tiene un desglose de fletes. Revertí el movimiento y registrá el correcto para conservar la trazabilidad.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
drop trigger if exists allocated_freight_cash_guard on public.cash_transactions;
create trigger allocated_freight_cash_guard before update or delete on public.cash_transactions for each row execute function guard_allocated_freight_cash();
create or replace function public.pay_logistics_freight(p_actor uuid,p_key uuid,p_payload jsonb,p_rows jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous logistics_freight_payment_requests;request jsonb;result jsonb;tx cash_transactions;alloc jsonb;part jsonb;target uuid;term logistics_freight_settlement_terms;paid numeric;total numeric;owner text;current_owner text;
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 request=jsonb_build_object('payload',p_payload,'rows',p_rows);
 select * into previous from logistics_freight_payment_requests where actor_id=p_actor and request_key=p_key;
 if found then if previous.payload is distinct from request then raise exception 'Solicitud reutilizada con otros datos';end if;return previous.result;end if;
 if p_payload->>'operation_type'<>'operating_expense' or p_payload->>'direction'<>'egreso' or p_payload->>'category'<>'Servicio de Flete' or nullif(p_payload->>'financial_concept_id','') is not null then raise exception 'Tipo de pago inválido';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 50 or (select count(distinct v->>'code') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception 'Desglose inválido';end if;
 for part in select value from jsonb_array_elements(p_rows) loop
  select p.dispatch_id,coalesce(logistics_company_for_carrier(p.carrier_id),'carrier:'||p.carrier_id::text) into target,current_owner from logistics_dispatch_plans p join logistics_dispatches d on d.id=p.dispatch_id where d.code=part->>'code' and p.status='completed';
  if target is null then raise exception 'La salida no está cerrada';end if;
  if owner is not null and owner<>current_owner then raise exception 'Un pago conjunto debe corresponder al mismo responsable';end if;owner=current_owner;
  select * into term from logistics_freight_settlement_terms where dispatch_id=target;
  if not found or term.version is distinct from (part->>'termsVersion')::integer then raise exception 'Confirmá el valor y las compensaciones de cada LOG antes de pagar' using errcode='40001';end if;
  if term.extra_snapshot is distinct from (select coalesce(actual->'extras','[]') from logistics_dispatch_plans where dispatch_id=target) then raise exception 'Los extras cambiaron: revisar costo';end if;
  select coalesce(sum(coalesce(a.amount,t.amount)),0) into paid from cash_transactions t
   left join logistics_freight_payment_allocations a on a.transaction_id=t.id and a.dispatch_id=target
   where t.type='egreso' and t.currency='ARS' and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
   and (a.dispatch_id is not null or not exists(select 1 from logistics_freight_payment_allocations x where x.transaction_id=t.id) and exists(select 1 from logistics_dispatch_movements l where l.transaction_id=t.id and l.dispatch_id=target and l.purpose='freight_fee'));
  if (part->>'amount')::numeric<=0 or (part->>'amount')::numeric>term.net_amount-paid or (part->>'amount')::numeric<>round((part->>'amount')::numeric,2) then raise exception 'El pago supera el saldo o tiene un importe inválido';end if;
 end loop;
 select sum((v->>'amount')::numeric) into total from jsonb_array_elements(p_rows) v;
 if total is distinct from (p_payload->>'amount')::numeric then raise exception 'El desglose no coincide con el egreso';end if;
 result=save_catalog_financial_operation(p_actor,p_key,'save',p_payload,'{}','');
 if jsonb_array_length(result->'transaction_ids')<>1 then raise exception 'Se esperaba un único movimiento de Caja';end if;
 select * into strict tx from cash_transactions where id=(result->'transaction_ids'->>0)::uuid;
 if tx.currency<>'ARS' or tx.type<>'egreso' or tx.amount<>total then raise exception 'El pago debe estar en pesos';end if;
 alloc=allocate_logistics_freight_payment(p_actor,tx.id,to_jsonb(tx),'[]',p_rows);
 result=result||jsonb_build_object('allocation',alloc,'movement_code',tx.movement_code);
 insert into logistics_freight_payment_requests(actor_id,request_key,payload,result) values(p_actor,p_key,request,result);
 return result;
end$$;
revoke all on function public.save_logistics_freight_novelty(uuid,uuid,jsonb),public.sync_logistics_novelty_applications(),public.guard_allocated_freight_cash(),public.logistics_company_for_carrier(uuid),public.pay_logistics_freight(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_logistics_freight_novelty(uuid,uuid,jsonb),public.pay_logistics_freight(uuid,uuid,jsonb,jsonb) to service_role;
commit;
