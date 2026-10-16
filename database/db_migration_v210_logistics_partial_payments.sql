begin;
-- Supplementary accounting: never changes the cash ledger or creates payments.
create table if not exists public.logistics_freight_settlement_terms (
 dispatch_id uuid primary key references public.logistics_dispatches(id),
 gross_amount numeric(16,2) not null check(gross_amount>0 and gross_amount<=100000000),
 net_amount numeric(16,2) not null check(net_amount>=0 and net_amount<=gross_amount),
 deductions jsonb not null default '[]', extra_snapshot jsonb not null default '[]', evidence text not null,
 version integer not null default 1, confirmed_by uuid not null, updated_at timestamptz not null default now()
);
alter table public.logistics_freight_settlement_terms add column if not exists extra_snapshot jsonb not null default '[]';
create table if not exists public.logistics_freight_payment_allocations (
 transaction_id uuid not null references public.cash_transactions(id),
 dispatch_id uuid not null references public.logistics_dispatches(id),
 amount numeric(16,2) not null check(amount>0), reason text not null,
 confirmed_by uuid not null, updated_at timestamptz not null default now(),
 primary key(transaction_id,dispatch_id)
);
create index if not exists logistics_freight_allocation_dispatch on public.logistics_freight_payment_allocations(dispatch_id);
create table if not exists public.logistics_freight_accounting_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 dispatch_id uuid references public.logistics_dispatches(id), transaction_id uuid references public.cash_transactions(id),
 kind text not null, previous_data jsonb, new_data jsonb not null, created_at timestamptz not null default now()
);
do $$declare t text;begin
 foreach t in array array['logistics_freight_settlement_terms','logistics_freight_payment_allocations','logistics_freight_accounting_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;
create or replace function public.save_logistics_freight_settlement_terms(p_actor uuid,p_dispatch uuid,p_version integer,p_terms jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous logistics_freight_settlement_terms%rowtype; gross numeric; net numeric; deducted numeric; saved logistics_freight_settlement_terms%rowtype;
begin
 if not coalesce(public.can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 if not exists(select 1 from logistics_dispatch_plans where dispatch_id=p_dispatch and status='completed') then raise exception 'La salida debe estar cerrada';end if;
 select * into previous from logistics_freight_settlement_terms where dispatch_id=p_dispatch for update;
 if coalesce(p_terms->'extraSnapshot','[]'::jsonb) is distinct from (select coalesce(actual->'extras','[]'::jsonb) from logistics_dispatch_plans where dispatch_id=p_dispatch) then raise exception 'Los extras cambiaron. Actualizá.' using errcode='40001';end if;
 if coalesce(previous.version,0) is distinct from p_version then raise exception 'El saldo cambió. Actualizá.' using errcode='40001';end if;
 gross=(p_terms->>'grossAmount')::numeric;net=(p_terms->>'netAmount')::numeric;
 if gross is null or net is null or gross<=0 or gross>100000000 or gross<>round(gross,2) or net<>round(net,2)
  or jsonb_typeof(p_terms->'deductions') is distinct from 'array' or jsonb_array_length(p_terms->'deductions')>30
  or length(trim(coalesce(p_terms->>'evidence',''))) not between 1 and 2000 then raise exception 'Importe o evidencia inválidos';end if;
 if exists(select 1 from jsonb_array_elements(p_terms->'deductions') d where
  length(trim(coalesce(d->>'label',''))) not between 1 and 300 or length(trim(coalesce(d->>'reference',''))) not between 1 and 500
  or coalesce(d->>'kind','') not in ('discount','offset') or (d->>'amount') is null
  or (d->>'amount')::numeric<=0 or (d->>'amount')::numeric<>round((d->>'amount')::numeric,2)) then raise exception 'Descuento inválido';end if;
 select coalesce(sum((d->>'amount')::numeric),0) into deducted from jsonb_array_elements(p_terms->'deductions') d;
 if deducted>gross or net is distinct from gross-deducted then raise exception 'El neto no coincide';end if;
 insert into logistics_freight_settlement_terms(dispatch_id,gross_amount,net_amount,deductions,extra_snapshot,evidence,version,confirmed_by)
 values(p_dispatch,gross,net,p_terms->'deductions',coalesce(p_terms->'extraSnapshot','[]'::jsonb),p_terms->>'evidence',p_version+1,p_actor)
 on conflict(dispatch_id) do update set gross_amount=excluded.gross_amount,net_amount=excluded.net_amount,deductions=excluded.deductions,extra_snapshot=excluded.extra_snapshot,evidence=excluded.evidence,version=excluded.version,confirmed_by=excluded.confirmed_by,updated_at=now()
 returning * into saved;
 insert into logistics_freight_accounting_events(actor_id,dispatch_id,kind,previous_data,new_data) values(p_actor,p_dispatch,'settlement_terms',case when previous.dispatch_id is null then null else to_jsonb(previous) end,to_jsonb(saved));
 return to_jsonb(saved);
end;$$;
create or replace function public.allocate_logistics_freight_payment(p_actor uuid,p_transaction uuid,p_expected jsonb,p_previous jsonb,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tx cash_transactions%rowtype; previous jsonb; r jsonb; total numeric; target uuid;
begin
 if not coalesce(public.can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into tx from cash_transactions where id=p_transaction for update;
 if not found or tx.type<>'egreso' or tx.currency<>'ARS' or tx.amount<=0 or tx.reversal_of_transaction_id is not null
  or not (lower(trim(coalesce(tx.category,'')))='servicio de flete' or lower(trim(coalesce(tx.sub_category,'')))='servicio de flete')
  or exists(select 1 from cash_transactions where reversal_of_transaction_id=tx.id) then raise exception 'Pago de flete inválido o revertido';end if;
 if tx.amount is distinct from (p_expected->>'amount')::numeric or tx.notes is distinct from p_expected->>'notes'
  or tx.concept is distinct from p_expected->>'concept' or tx.created_at is distinct from (p_expected->>'created_at')::timestamptz
  then raise exception 'El movimiento cambió. Volvé a consultarlo.' using errcode='40001';end if;
 select coalesce(jsonb_agg(jsonb_build_object('dispatch_id',dispatch_id,'amount',amount,'reason',reason) order by dispatch_id),'[]') into previous from logistics_freight_payment_allocations where transaction_id=p_transaction;
 if previous is distinct from (select coalesce(jsonb_agg(v order by v->>'dispatch_id'),'[]') from jsonb_array_elements(p_previous) v) then raise exception 'El desglose cambió. Volvé a consultarlo.' using errcode='40001';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 50 then raise exception 'Desglose inválido';end if;
 if (select count(distinct v->>'code') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception 'LOG repetido';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) v where (v->>'amount') is null or (v->>'amount')::numeric<=0 or (v->>'amount')::numeric<>round((v->>'amount')::numeric,2) or length(trim(coalesce(v->>'reason',''))) not between 1 and 500) then raise exception 'Importe o motivo inválidos';end if;
 select sum((v->>'amount')::numeric) into total from jsonb_array_elements(p_rows) v;
 if total is distinct from tx.amount then raise exception 'El desglose debe sumar el pago completo';end if;
 delete from logistics_freight_payment_allocations where transaction_id=p_transaction;
 for r in select value from jsonb_array_elements(p_rows) loop
  select d.id into target from logistics_dispatches d join logistics_dispatch_plans p on p.dispatch_id=d.id where d.code=r->>'code' and p.status='completed';
  if target is null then raise exception 'LOG inexistente o sin cerrar: %',r->>'code';end if;
  insert into logistics_freight_payment_allocations(transaction_id,dispatch_id,amount,reason,confirmed_by) values(p_transaction,target,(r->>'amount')::numeric,r->>'reason',p_actor);
 end loop;
 insert into logistics_freight_accounting_events(actor_id,transaction_id,kind,previous_data,new_data) values(p_actor,p_transaction,'payment_allocation',previous,p_rows);
 return jsonb_build_object('allocated',jsonb_array_length(p_rows),'amount',total);
end;$$;
revoke all on function public.save_logistics_freight_settlement_terms(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.allocate_logistics_freight_payment(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_logistics_freight_settlement_terms(uuid,uuid,integer,jsonb) to service_role;
grant execute on function public.allocate_logistics_freight_payment(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
commit;
