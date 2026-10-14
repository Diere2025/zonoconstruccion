begin;
alter table public.logistics_dispatch_movements add column if not exists purpose text
 check(purpose is null or purpose in ('freight_fee','rendition_cash','toll','other'));
create table if not exists public.logistics_payment_link_events (
 id uuid primary key default gen_random_uuid(), transaction_id uuid not null references public.cash_transactions(id),
 actor_id uuid not null, previous_link jsonb, new_link jsonb not null, source_evidence jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.logistics_payment_link_events enable row level security;
revoke all on public.logistics_payment_link_events from anon,authenticated;
grant all on public.logistics_payment_link_events to service_role;
create or replace function public.reconcile_logistics_payment_links(p_actor uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; tx cash_transactions%rowtype; previous logistics_dispatch_movements%rowtype;
 target uuid; saved logistics_dispatch_movements%rowtype; n integer=0;
begin
 if not coalesce(public.can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso para conciliar pagos' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Selección inválida';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 for r in select value from jsonb_array_elements(p_rows) order by value->>'transactionId' loop
  select * into tx from cash_transactions where id=(r->>'transactionId')::uuid for update;
  if not found or tx.type<>'egreso' or tx.currency<>'ARS' or tx.amount<=0 or tx.reversal_of_transaction_id is not null then raise exception 'Pago inválido';end if;
  if exists(select 1 from cash_transactions where reversal_of_transaction_id=tx.id) then raise exception 'El pago fue revertido';end if;
  if tx.amount is distinct from (r->'transaction'->>'amount')::numeric
   or tx.created_at is distinct from (r->'transaction'->>'created_at')::timestamptz
   or tx.concept is distinct from r->'transaction'->>'concept'
   or tx.notes is distinct from r->'transaction'->>'notes'
   or tx.financial_account_id is distinct from (r->'transaction'->>'financial_account_id')::uuid
  then raise exception 'El movimiento cambió. Volvé a consultar.' using errcode='40001';end if;
  select id into target from logistics_dispatches where code=r->'source'->>'code';
  if target is null or target is distinct from (r->>'dispatchId')::uuid
   or r->'source'->>'category' is distinct from 'Servicio de Flete'
   or (r->'source'->>'amount')::numeric is distinct from tx.amount
   or r->'source'->>'spreadsheetId' is distinct from '12OEQtYGyjFLTgnr0I4b8oXnH2qymv6rrQuby9_-ssRY'
   or r->'source'->>'row' is null or (r->'source'->>'row')::integer<2
   or (tx.created_at at time zone 'America/Argentina/Buenos_Aires')::date is distinct from (r->'source'->>'date')::date
  then raise exception 'Evidencia del LOG inválida';end if;
  select * into previous from logistics_dispatch_movements where transaction_id=tx.id for update;
  if found and previous.dispatch_id=target and previous.purpose='freight_fee' then continue;end if;
  insert into logistics_dispatch_movements(transaction_id,dispatch_id,method,source_row,purpose)
   values(tx.id,target,'source_verified', (r->'source'->>'row')::integer,'freight_fee')
   on conflict(transaction_id) do update set dispatch_id=excluded.dispatch_id,settlement_id=null,
    method=excluded.method,source_row=excluded.source_row,purpose=excluded.purpose,linked_at=now()
   returning * into saved;
  insert into logistics_payment_link_events(transaction_id,actor_id,previous_link,new_link,source_evidence)
   values(tx.id,p_actor,case when previous.transaction_id is null then null else to_jsonb(previous) end,to_jsonb(saved),r->'source');
  n=n+1;
 end loop;
 return jsonb_build_object('linked',n);
end;
$$;
revoke all on function public.reconcile_logistics_payment_links(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_logistics_payment_links(uuid,jsonb) to service_role;
commit;
