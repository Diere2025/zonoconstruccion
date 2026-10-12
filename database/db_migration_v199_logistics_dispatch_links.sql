begin;
create table if not exists public.logistics_dispatches (
 id uuid primary key default gen_random_uuid(),code text not null unique check(code ~ '^LOG_REC_[0-9]+$'),
 delivery_date date not null,carrier_name text not null default '',data jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
create table if not exists public.logistics_dispatch_attempts (
 id uuid primary key default gen_random_uuid(),dispatch_id uuid not null references public.logistics_dispatches(id),
 order_code text not null,order_id uuid references public.orders(id) on delete set null,
 delivery_id uuid references public.deliveries(id) on delete set null,
 outcome text not null,executed boolean not null default true,source_rows jsonb not null default '[]',
 source_spreadsheet_id text not null,unique(dispatch_id,order_code)
);
create table if not exists public.logistics_dispatch_settlements (
 settlement_id uuid primary key references public.treasury_settlements(id) on delete cascade,
 dispatch_id uuid not null references public.logistics_dispatches(id),source_row integer,
 linked_at timestamptz not null default now()
);
create table if not exists public.logistics_dispatch_routes (
 route_sheet_id uuid primary key references public.route_sheets(id) on delete cascade,
 dispatch_id uuid not null references public.logistics_dispatches(id)
);
create table if not exists public.logistics_dispatch_movements (
 transaction_id uuid primary key references public.cash_transactions(id) on delete cascade,
 dispatch_id uuid not null references public.logistics_dispatches(id),
 settlement_id uuid references public.treasury_settlements(id) on delete set null,
 method text not null,source_row integer,linked_at timestamptz not null default now()
);
create table if not exists public.logistics_link_issues (
 key text primary key,kind text not null,code text not null default '',reference text not null default '',
 message text not null,source_from date not null,source_to date not null,updated_at timestamptz not null default now()
);
create index if not exists logistics_dispatch_date on public.logistics_dispatches(delivery_date);
create index if not exists logistics_dispatch_attempt_order on public.logistics_dispatch_attempts(order_id);
create index if not exists logistics_dispatch_settlement_dispatch on public.logistics_dispatch_settlements(dispatch_id);
create index if not exists logistics_dispatch_movement_dispatch on public.logistics_dispatch_movements(dispatch_id);
create index if not exists logistics_dispatch_route_dispatch on public.logistics_dispatch_routes(dispatch_id);
do $$declare t text;begin
 foreach t in array array['logistics_dispatches','logistics_dispatch_attempts','logistics_dispatch_settlements','logistics_dispatch_routes','logistics_dispatch_movements','logistics_link_issues'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists dispatch_read on public.%I',t);
  execute format('create policy dispatch_read on public.%I for select to authenticated using (public.can_manage_treasury_settlements())',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end$$;
create or replace function public.sync_logistics_dispatch_links(p_actor uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_from date;v_to date;r record;v_count int;v_settlement uuid;
begin
 if not public.is_treasury_settlement_admin(p_actor) then raise exception 'Solo un administrador puede vincular salidas.' using errcode='42501';end if;
 v_from=(p_payload->>'from')::date;v_to=(p_payload->>'to')::date;
 if v_from>v_to or v_to-v_from>93 then raise exception 'Período inválido';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 if jsonb_array_length(p_payload->'dispatches')>1000 or jsonb_array_length(p_payload->'attempts')>10000 then raise exception 'Demasiados registros';end if;
 insert into logistics_dispatches(code,delivery_date,carrier_name,data)
 select x.code,x.date::date,x."carrierName",x.data from jsonb_to_recordset(p_payload->'dispatches') as x(code text,date text,"carrierName" text,data jsonb)
 where x.date::date between v_from and v_to
 on conflict(code) do update set delivery_date=excluded.delivery_date,carrier_name=excluded.carrier_name,data=excluded.data,updated_at=now();
 insert into logistics_dispatch_attempts(dispatch_id,order_code,order_id,delivery_id,outcome,executed,source_rows,source_spreadsheet_id)
 select ds.id,x."orderCode",o.id,d.id,x.status,x.executed,to_jsonb(x."sourceRows"),'1TYeIyGbDleed1bTJyhuaxcM97KMbNbL--1OswOppROg'
 from jsonb_to_recordset(p_payload->'attempts') as x(code text,"orderCode" text,date text,status text,executed boolean,"sourceRows" int[])
 join logistics_dispatches ds on ds.code=x.code and ds.delivery_date=x.date::date
 left join lateral (select case when count(*)=1 then (array_agg(id))[1] end id from orders where upper(trim(legacy_code))=x."orderCode") o on true
 left join deliveries d on d.order_id=o.id and d.delivery_date=ds.delivery_date
 on conflict(dispatch_id,order_code) do update set order_id=excluded.order_id,delivery_id=excluded.delivery_id,outcome=excluded.outcome,executed=excluded.executed,source_rows=excluded.source_rows;
 -- Remove stale associations only for the refreshed dispatches; keep source rows that are explicitly excluded.
 delete from logistics_dispatch_attempts a using logistics_dispatches ds
 where a.dispatch_id=ds.id and ds.code in(select x->>'code' from jsonb_array_elements(p_payload->'dispatches') x)
 and not exists(select 1 from jsonb_array_elements(p_payload->'attempts') x where x->>'code'=ds.code and x->>'orderCode'=a.order_code);
 -- Import only missing renditions. Existing confirmed/archived values and ledger entries remain untouched.
 for r in select * from jsonb_to_recordset(p_payload->'settlements') as x(code text,"dispatchCode" text,date text,row int,data jsonb) loop
  if not exists(select 1 from treasury_settlements where code=r.code) then
   insert into treasury_settlements(code,settlement_date,carrier_name,route_detail,status,source,source_spreadsheet_id,source_row,
    change_fund,shortage_recovered,deliveries_total,electronic_total,tolls_total,extraordinary_total,expected_cash,counted_cash,difference,
    created_by,confirmed_by,confirmed_at)
   values(r.code,r.date::date,r.data->>'carrier_name',r.data->>'route_detail',r.data->>'status','spreadsheet',
    '1NEXHZbDJhXCHpsZEyKq3k3rq_O_foLDtct-hvsFeifI',r.row,
    (r.data->>'change_fund')::numeric,(r.data->>'shortage_recovered')::numeric,(r.data->>'deliveries_total')::numeric,
    (r.data->>'electronic_total')::numeric,(r.data->>'tolls_total')::numeric,(r.data->>'extraordinary_total')::numeric,
    (r.data->>'expected_cash')::numeric,(r.data->>'counted_cash')::numeric,(r.data->>'difference')::numeric,p_actor,
    case when r.data->>'status'='confirmed' then p_actor end,case when r.data->>'status'='confirmed' then now() end)
   on conflict do nothing returning id into v_settlement;
   if v_settlement is not null then
    insert into treasury_settlement_expenses(settlement_id,expense_type,amount,reference,sort_order)
    select v_settlement,x.expense_type,x.amount,x.reference,0 from jsonb_to_recordset(r.data->'expenses') as x(expense_type text,amount numeric,reference text);
    insert into treasury_settlement_electronic_tickets(settlement_id,amount,reference,payment_type,sort_order)
    select v_settlement,x.amount,x.reference,x.payment_type,x.sort_order from jsonb_to_recordset(r.data->'tickets') as x(amount numeric,reference text,payment_type text,sort_order int);
   end if;
  end if;
 end loop;

 insert into logistics_dispatch_settlements(settlement_id,dispatch_id,source_row)
 select s.id,ds.id,x.row from jsonb_to_recordset(p_payload->'settlements') as x(code text,"dispatchCode" text,date text,row int)
 join treasury_settlements s on s.code=x.code and s.settlement_date=x.date::date
 join logistics_dispatches ds on ds.code=x."dispatchCode"
 on conflict(settlement_id) do update set dispatch_id=excluded.dispatch_id,source_row=excluded.source_row,linked_at=now();
 delete from logistics_dispatch_settlements l using treasury_settlements s
 where l.settlement_id=s.id and s.status<>'archived' and s.source_spreadsheet_id='1NEXHZbDJhXCHpsZEyKq3k3rq_O_foLDtct-hvsFeifI'
 and s.settlement_date between v_from and v_to
 and not exists(select 1 from jsonb_array_elements(p_payload->'settlements') x where x->>'code'=s.code);
 -- Route sub-runs remain separate; link only existing exact codes or an already-associated rendition.
 for r in select rs.id route_id,ds.id dispatch_id from route_sheets rs join logistics_dispatches ds on ds.code=rs.code
 union select s.route_sheet_id,l.dispatch_id from logistics_dispatch_settlements l join treasury_settlements s on s.id=l.settlement_id where s.route_sheet_id is not null loop
  if exists(select 1 from logistics_dispatch_routes where route_sheet_id=r.route_id and dispatch_id<>r.dispatch_id) then raise exception 'Un recorrido apunta a dos salidas; revisar manualmente';end if;
  insert into logistics_dispatch_routes values(r.route_id,r.dispatch_id) on conflict do nothing;
 end loop;
 -- Remove stale inferred movement links when their source became ambiguous or was corrected.
 delete from logistics_dispatch_movements m using logistics_dispatches d where m.dispatch_id=d.id and d.delivery_date between v_from and v_to and m.method='source_row_unique'
 and not exists(select 1 from jsonb_array_elements(p_payload->'movementLinks') x where (x->>'transactionId')::uuid=m.transaction_id);
 delete from logistics_dispatch_movements m using treasury_settlements s where m.settlement_id=s.id and s.settlement_date between v_from and v_to
 and not exists(select 1 from logistics_dispatch_settlements l where l.settlement_id=m.settlement_id and l.dispatch_id=m.dispatch_id);
 for r in select * from jsonb_to_recordset(p_payload->'movementLinks') as x(code text,"transactionId" uuid,"settlementCode" text,date text,type text,amount numeric,concept text,"accountId" uuid,"sourceRow" int) loop
  perform 1 from cash_transactions t where t.id=r."transactionId" and t.is_imported and t.reversal_of_transaction_id is null
   and t.financial_account_id=r."accountId" and (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date=r.date::date
   and t.type=r.type and t.amount=r.amount and t.concept=r.concept for update;
  if not found then raise exception 'El movimiento cambió; actualizar la vista previa';end if;
  insert into logistics_dispatch_movements(transaction_id,dispatch_id,settlement_id,method,source_row)
  select r."transactionId",ds.id,s.id,'source_row_unique',r."sourceRow" from logistics_dispatches ds
  left join treasury_settlements s on s.code=r."settlementCode" and s.status<>'archived'
  where ds.code=r.code
  on conflict(transaction_id) do update set dispatch_id=excluded.dispatch_id,settlement_id=excluded.settlement_id,method=excluded.method,source_row=excluded.source_row,linked_at=now();
 end loop;
 -- Existing confirmed payment links and generated movements carry their own explicit provenance.
 insert into logistics_dispatch_movements(transaction_id,dispatch_id,settlement_id,method)
 select t.id,l.dispatch_id,l.settlement_id,'settlement_id' from cash_transactions t
 join logistics_dispatch_settlements l on l.settlement_id=t.treasury_settlement_id
 where t.reversal_of_transaction_id is null on conflict(transaction_id) do nothing;
 insert into logistics_dispatch_movements(transaction_id,dispatch_id,settlement_id,method)
 select cp.cash_transaction_id,l.dispatch_id,l.settlement_id,'approved_settlement_payment' from treasury_settlement_payment_links p
 join logistics_dispatch_settlements l on l.settlement_id=p.settlement_id
 join client_payments cp on cp.id=p.client_payment_id
 where p.archived_at is null and cp.reversed_at is null and cp.status='Aprobado' and cp.cash_transaction_id is not null
 on conflict(transaction_id) do nothing;
 delete from logistics_link_issues where source_from>=v_from and source_to<=v_to;
 insert into logistics_link_issues(key,kind,code,reference,message,source_from,source_to)
 select x.key,x.kind,x.code,x.reference,x.message,v_from,v_to from jsonb_to_recordset(p_payload->'issues') as x(key text,kind text,code text,reference text,message text)
 on conflict(key) do update set message=excluded.message,source_from=excluded.source_from,source_to=excluded.source_to,updated_at=now();
 insert into logistics_link_issues(key,kind,code,reference,message,source_from,source_to)
 select 'missing_order|'||ds.code||'|'||a.order_code,'missing_order',ds.code,a.order_code,'Pedido de planilla todavía no localizado en el ERP.',v_from,v_to
 from logistics_dispatch_attempts a join logistics_dispatches ds on ds.id=a.dispatch_id where a.order_id is null and ds.delivery_date between v_from and v_to on conflict do nothing;
 insert into logistics_link_issues(key,kind,code,reference,message,source_from,source_to)
 select 'missing_settlement|'||(x->>'code'),'missing_settlement',x->>'dispatchCode',x->>'code','Rendición todavía no importada o archivada en el ERP.',v_from,v_to
 from jsonb_array_elements(p_payload->'settlements') x where not exists(select 1 from treasury_settlements s where s.code=x->>'code') on conflict do nothing;
 return jsonb_build_object('dispatches',(select count(*) from logistics_dispatches where delivery_date between v_from and v_to),
  'attempts',(select count(*) from logistics_dispatch_attempts a join logistics_dispatches d on d.id=a.dispatch_id where d.delivery_date between v_from and v_to and a.executed),
  'settlements',(select count(*) from logistics_dispatch_settlements l join logistics_dispatches d on d.id=l.dispatch_id where d.delivery_date between v_from and v_to),
  'movements',(select count(*) from logistics_dispatch_movements l join logistics_dispatches d on d.id=l.dispatch_id where d.delivery_date between v_from and v_to),
  'issues',(select count(*) from logistics_link_issues where source_from=v_from and source_to=v_to));
end$$;
revoke all on function public.sync_logistics_dispatch_links(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sync_logistics_dispatch_links(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
