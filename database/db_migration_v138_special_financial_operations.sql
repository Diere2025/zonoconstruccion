begin;
alter table public.financial_operations drop constraint if exists financial_operations_operation_type_check;
alter table public.financial_operations add constraint financial_operations_operation_type_check check(operation_type in ('general','supplier_payment','customer_collection','payroll_payment','operating_expense','tax_payment','internal_transfer','custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count'));

create table if not exists public.financial_custody_funds(
 id uuid primary key default gen_random_uuid(),custodian text not null,purpose text not null,
 account_id uuid not null references public.financial_accounts(id),currency text not null,
 balance numeric(15,2) not null default 0 check(balance>=0),pending numeric(15,2) not null default 0 check(pending>=0),
 status text not null default 'open' check(status in ('open','closed')),version integer not null default 1,
 last_operation_id uuid references public.financial_operations(id),created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists financial_custody_open_account on public.financial_custody_funds(account_id) where status='open';
create table if not exists public.financial_financing(
 id uuid primary key default gen_random_uuid(),counterparty text not null,reference text not null,currency text not null,
 side text not null check(side in ('borrower','lender')),capital numeric(15,2) not null check(capital>=0),
 version integer not null default 1,last_operation_id uuid references public.financial_operations(id),created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.financial_cash_counts(
 id uuid primary key default gen_random_uuid(),account_id uuid not null references public.financial_accounts(id),
 cutoff timestamptz not null,expected numeric(15,2) not null,counted numeric(15,2) not null check(counted>=0),
 fingerprint text not null,status text not null check(status in ('recorded','adjusted','cancelled')),version integer not null default 1,
 last_operation_id uuid references public.financial_operations(id),created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists financial_financing_reference on public.financial_financing(counterparty,reference,currency,side);
create table if not exists public.financial_special_effects(
 operation_id uuid primary key references public.financial_operations(id),
 fund_id uuid references public.financial_custody_funds(id),loan_id uuid references public.financial_financing(id),count_id uuid references public.financial_cash_counts(id),
 balance_delta numeric(15,2) not null default 0,pending_delta numeric(15,2) not null default 0,capital_delta numeric(15,2) not null default 0,
 created_resource boolean not null default false
);
alter table public.financial_custody_funds enable row level security;
alter table public.financial_financing enable row level security;
alter table public.financial_cash_counts enable row level security;
alter table public.financial_special_effects enable row level security;
revoke all on public.financial_custody_funds,public.financial_financing,public.financial_cash_counts,public.financial_special_effects from anon,authenticated;
grant all on public.financial_custody_funds,public.financial_financing,public.financial_cash_counts,public.financial_special_effects to service_role;

create or replace function public.financial_account_cut(p_account uuid,p_cutoff timestamptz)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('balance',coalesce(sum(case when type='ingreso' then amount else -amount end),0)::text,
 'fingerprint',md5(coalesce(string_agg(concat_ws('|',id,type,amount,currency,created_at),';' order by id),'')),
 'has_history',exists(select 1 from public.cash_transactions where financial_account_id=p_account))
 from public.cash_transactions where financial_account_id=p_account and created_at<=p_cutoff;
$$;
revoke all on function public.financial_account_cut(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.financial_account_cut(uuid,timestamptz) to service_role;

-- Only the authenticated server calls this RPC after building the typed plan.
-- Resource versions and ledger locks protect the plan against intervening writes.
create or replace function public.persist_special_financial_operation(p_actor uuid,p_key uuid,p_input jsonb,p_plan jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prior public.financial_operation_requests;v_op public.financial_operations;v_fund public.financial_custody_funds;
 v_loan public.financial_financing;v_count public.financial_cash_counts;v_line jsonb;v_acc public.financial_accounts;
 v_f uuid;v_l uuid;v_c uuid;v_amount numeric;v_date date;v_time timestamptz;v_result jsonb;v_cut jsonb;v_new boolean:=false;
begin
 if not public.can_manage_financial_operations(p_actor) then raise exception 'No tenés permiso para guardar.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('special-financial-operations',0));
 select * into v_prior from public.financial_operation_requests where actor_id=p_actor and request_key=p_key;
 if found then if v_prior.action<>'special.save' or v_prior.payload<>p_input then raise exception 'La solicitud ya fue usada con otros datos.' using errcode='23505';end if;return v_prior.result;end if;
 if p_input->>'operation_type' not in ('custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count') then raise exception 'Familia inválida.';end if;
 if length(trim(coalesce(p_input->>'concept','')))<2 then raise exception 'Indicá un detalle.';end if;
 v_date:=(p_input->>'effective_date')::date;
 if p_plan ? 'count' then v_date:=((p_plan#>>'{count,cutoff}')::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date;end if;
 v_time:=make_timestamptz(extract(year from v_date)::int,extract(month from v_date)::int,extract(day from v_date)::int,12,0,0,'America/Argentina/Buenos_Aires');
 perform 1 from payment_methods where id=(p_input->>'payment_method_id')::uuid;if not found then raise exception 'Medio de pago inválido.';end if;
 lock table public.cash_transactions in share row exclusive mode;
 if p_input->>'operation_type'='asset_trade' and p_input->>'action'='purchase' then
  lock table public.supplier_purchases in share mode;
  if coalesce((p_input->>'document_not_registered')::boolean,false)=false or exists(select 1 from supplier_purchases where lower(trim(invoice_number))=lower(trim(p_input->>'reference'))) then raise exception 'El documento ya existe o no fue revisado: usá Pago a proveedor.';end if;
 end if;
 insert into financial_operations(operation_type,effective_date,detail,created_by) values(p_input->>'operation_type',v_date,jsonb_build_object('input',p_input),p_actor) returning * into v_op;
 if p_plan ? 'fund' then
  if p_plan#>'{fund,create}' is not null then
   v_cut:=financial_account_cut((p_plan#>>'{fund,create,account_id}')::uuid,'infinity');
   if (v_cut->>'balance')::numeric<>0 or exists(select 1 from cash_transactions t left join financial_operations o on o.id=t.operation_id where t.financial_account_id=(p_plan#>>'{fund,create,account_id}')::uuid and coalesce(o.operation_type,'')<>'custody_fund') then raise exception 'La custodia requiere una cuenta sin movimientos ajenos y con saldo cero.';end if;
   insert into financial_custody_funds(custodian,purpose,account_id,currency,balance,pending,last_operation_id)
   values(p_plan#>>'{fund,create,custodian}',p_plan#>>'{fund,create,purpose}',(p_plan#>>'{fund,create,account_id}')::uuid,p_plan#>>'{fund,create,currency}',(p_plan#>>'{fund,balance_delta}')::numeric,(p_plan#>>'{fund,pending_delta}')::numeric,v_op.id) returning * into v_fund;v_new:=true;
  else
   select * into strict v_fund from financial_custody_funds where id=(p_plan#>>'{fund,id}')::uuid for update;
   if v_fund.version<>(p_plan#>>'{fund,version}')::integer or v_fund.status<>'open' then raise exception 'El fondo cambió: actualizá los datos.' using errcode='40001';end if;
   if v_date<(select effective_date from financial_operations where id=v_fund.last_operation_id) then raise exception 'La fecha precede a la última operación del fondo.';end if;
   v_cut:=financial_account_cut(v_fund.account_id,'infinity');if (v_cut->>'balance')::numeric<>v_fund.balance then raise exception 'La cuenta de custodia tiene movimientos externos: revisá el fondo.';end if;
   update financial_custody_funds set balance=balance+(p_plan#>>'{fund,balance_delta}')::numeric,pending=pending+(p_plan#>>'{fund,pending_delta}')::numeric,
    status=case when coalesce((p_plan#>>'{fund,close}')::boolean,false) then 'closed' else status end,version=version+1,last_operation_id=v_op.id where id=v_fund.id returning * into v_fund;
   if v_fund.status='closed' and (v_fund.balance<>0 or v_fund.pending<>0) then raise exception 'El fondo tiene saldos pendientes.';end if;
  end if;v_f:=v_fund.id;
 end if;
 if p_plan ? 'loan' then
  if p_plan#>'{loan,create}' is not null then
   insert into financial_financing(counterparty,reference,currency,side,capital,last_operation_id) values(p_plan#>>'{loan,create,counterparty}',p_plan#>>'{loan,create,reference}',p_plan#>>'{loan,create,currency}',p_plan#>>'{loan,create,side}',(p_plan#>>'{loan,capital_delta}')::numeric,v_op.id) returning * into v_loan;v_new:=true;
  else
   select * into strict v_loan from financial_financing where id=(p_plan#>>'{loan,id}')::uuid for update;
   if v_loan.version<>(p_plan#>>'{loan,version}')::integer then raise exception 'La financiación cambió: actualizá los datos.' using errcode='40001';end if;
   if v_date<(select effective_date from financial_operations where id=v_loan.last_operation_id) then raise exception 'La fecha precede a la última operación de financiación.';end if;
   update financial_financing set capital=capital+(p_plan#>>'{loan,capital_delta}')::numeric,version=version+1,last_operation_id=v_op.id where id=v_loan.id returning * into v_loan;
  end if;v_l:=v_loan.id;
 end if;
 if p_plan ? 'count' then
  v_cut:=financial_account_cut((p_plan#>>'{count,account_id}')::uuid,(p_plan#>>'{count,cutoff}')::timestamptz);
  if v_cut->>'fingerprint'<>p_plan#>>'{count,fingerprint}' then raise exception 'Los movimientos al corte cambiaron. Registrá un nuevo arqueo.' using errcode='40001';end if;
  if coalesce((p_plan#>>'{count,opening}')::boolean,false) and (v_cut->>'has_history')::boolean then raise exception 'La cuenta ya tiene movimientos: no admite apertura.';end if;
  if p_plan#>>'{count,id}' is not null then
   select * into strict v_count from financial_cash_counts where id=(p_plan#>>'{count,id}')::uuid for update;
   if v_count.version<>(p_plan#>>'{count,version}')::integer or v_count.status<>'recorded' then raise exception 'El arqueo ya fue modificado.' using errcode='40001';end if;
   update financial_cash_counts set status='adjusted',version=version+1,last_operation_id=v_op.id where id=v_count.id returning * into v_count;
  else
   insert into financial_cash_counts(account_id,cutoff,expected,counted,fingerprint,status,last_operation_id) values((p_plan#>>'{count,account_id}')::uuid,(p_plan#>>'{count,cutoff}')::timestamptz,(p_plan#>>'{count,expected}')::numeric,(p_plan#>>'{count,counted}')::numeric,p_plan#>>'{count,fingerprint}',p_plan#>>'{count,status}',v_op.id) returning * into v_count;v_new:=true;
  end if;v_c:=v_count.id;v_time:=v_count.cutoff;
 end if;
 perform set_config('zono.financial_write','on',true);
 perform set_config('zono.special_write','on',true);
 for v_line in select value from jsonb_array_elements(p_plan->'lines') loop
  select * into strict v_acc from financial_accounts where id=(v_line->>'account_id')::uuid and is_active for update;
  if exists(select 1 from financial_custody_funds where account_id=v_acc.id and status='open') and p_input->>'operation_type'<>'custody_fund' then raise exception 'La cuenta de custodia se opera desde el fondo.';end if;
  v_amount:=(v_line->>'amount')::numeric;
  if v_amount<=0 or v_amount>=1e12 or v_amount<>round(v_amount,2) or v_line->>'direction' not in ('ingreso','egreso') then raise exception 'Línea monetaria inválida.';end if;
  insert into cash_transactions(type,category,amount,currency,payment_method_id,financial_account_id,concept,notes,created_by,created_at,operation_id,operation_line)
  values(v_line->>'direction',v_line->>'category',v_amount,v_acc.currency,(p_input->>'payment_method_id')::uuid,v_acc.id,p_input->>'concept',p_input->>'notes',p_actor,v_time,v_op.id,v_line->>'line');
 end loop;
 insert into financial_special_effects(operation_id,fund_id,loan_id,count_id,balance_delta,pending_delta,capital_delta,created_resource)
 values(v_op.id,v_f,v_l,v_c,coalesce((p_plan#>>'{fund,balance_delta}')::numeric,0),coalesce((p_plan#>>'{fund,pending_delta}')::numeric,0),coalesce((p_plan#>>'{loan,capital_delta}')::numeric,0),v_new);
 insert into operation_vouchers(operation_id,voucher_id) select distinct v_op.id,x::uuid from jsonb_array_elements_text(coalesce(p_input->'voucher_ids','[]')) x;
 v_result:=jsonb_build_object('operation_id',v_op.id,'version',1,'status','posted','fund_id',v_f,'loan_id',v_l,'count_id',v_c);
 insert into financial_operation_events(operation_id,action,after_value,actor_id) values(v_op.id,'special.save',jsonb_build_object('input',p_input,'plan',p_plan,'result',v_result),p_actor);
 insert into financial_operation_requests(actor_id,request_key,action,payload,result) values(p_actor,p_key,'special.save',p_input,v_result);
 perform set_config('zono.special_write','off',true);perform set_config('zono.financial_write','off',true);return v_result;
end $$;
revoke all on function public.persist_special_financial_operation(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_special_financial_operation(uuid,uuid,jsonb,jsonb) to service_role;
create or replace function public.cancel_special_financial_operation(p_actor uuid,p_key uuid,p_operation uuid,p_version integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_op public.financial_operations;v_effect public.financial_special_effects;v_prev uuid;v_request jsonb;v_result jsonb;v_prior public.financial_operation_requests;
begin
 if not public.can_manage_financial_operations(p_actor) then raise exception 'No tenés permiso para anular.' using errcode='42501';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indicá el motivo.';end if;
 perform pg_advisory_xact_lock(hashtextextended('special-financial-operations',0));
 v_request:=jsonb_build_object('operation_id',p_operation,'version',p_version,'reason',p_reason);
 select * into v_prior from financial_operation_requests where actor_id=p_actor and request_key=p_key;
 if found then if v_prior.action<>'special.cancel' or v_prior.payload<>v_request then raise exception 'La solicitud ya fue usada.' using errcode='23505';end if;return v_prior.result;end if;
 select * into strict v_op from financial_operations where id=p_operation for update;
 if v_op.version<>p_version or v_op.status<>'posted' then raise exception 'La operación ya cambió.' using errcode='40001';end if;
 select * into strict v_effect from financial_special_effects where operation_id=p_operation;
 if exists(select 1 from payment_planning_realizations r join cash_transactions t on t.id=r.cash_transaction_id where t.operation_id=p_operation and r.reversed_at is null) then raise exception 'Desconciliá primero desde Planificación.';end if;
 if v_effect.fund_id is not null then
  perform 1 from financial_custody_funds where id=v_effect.fund_id and last_operation_id=p_operation for update;if not found then raise exception 'El fondo tiene operaciones posteriores; anulalas primero.';end if;
  select e.operation_id into v_prev from financial_special_effects e join financial_operations o on o.id=e.operation_id where e.fund_id=v_effect.fund_id and o.status='posted' and o.id<>p_operation order by o.created_at desc,o.id limit 1;
  update financial_custody_funds set balance=balance-v_effect.balance_delta,pending=pending-v_effect.pending_delta,status=case when v_effect.created_resource then 'closed' else 'open' end,version=version+1,last_operation_id=v_prev where id=v_effect.fund_id;
 end if;
 if v_effect.loan_id is not null then
  perform 1 from financial_financing where id=v_effect.loan_id and last_operation_id=p_operation for update;if not found then raise exception 'La financiación tiene operaciones posteriores; anulalas primero.';end if;
  select e.operation_id into v_prev from financial_special_effects e join financial_operations o on o.id=e.operation_id where e.loan_id=v_effect.loan_id and o.status='posted' and o.id<>p_operation order by o.created_at desc,o.id limit 1;
  update financial_financing set capital=capital-v_effect.capital_delta,version=version+1,last_operation_id=v_prev where id=v_effect.loan_id;
 end if;
 if v_effect.count_id is not null then
  perform 1 from financial_cash_counts where id=v_effect.count_id and last_operation_id=p_operation for update;if not found then raise exception 'El arqueo tiene una operación posterior.';end if;
  select e.operation_id into v_prev from financial_special_effects e join financial_operations o on o.id=e.operation_id where e.count_id=v_effect.count_id and o.status='posted' and o.id<>p_operation order by o.created_at desc,o.id limit 1;
  update financial_cash_counts set status=case when v_effect.created_resource then 'cancelled' else 'recorded' end,version=version+1,last_operation_id=v_prev where id=v_effect.count_id;
 end if;
 perform set_config('zono.financial_write','on',true);perform set_config('zono.special_write','on',true);
 insert into cash_transactions(type,category,amount,currency,payment_method_id,financial_account_id,concept,notes,created_by,created_at,operation_id,operation_line,reversal_of_transaction_id)
 select case when type='ingreso' then 'egreso' else 'ingreso' end,category,amount,currency,payment_method_id,financial_account_id,'Anulación: '||concept,p_reason,p_actor,created_at,operation_id,'reverse:'||operation_line,id
 from cash_transactions where operation_id=p_operation and reversal_of_transaction_id is null;
 update financial_operations set status='cancelled',version=version+1,updated_at=clock_timestamp() where id=p_operation;
 v_result:=jsonb_build_object('operation_id',p_operation,'status','cancelled','version',p_version+1);
 insert into financial_operation_events(operation_id,action,before_value,after_value,reason,actor_id) values(p_operation,'special.cancel',to_jsonb(v_op),v_result,p_reason,p_actor);
 insert into financial_operation_requests(actor_id,request_key,action,payload,result) values(p_actor,p_key,'special.cancel',v_request,v_result);
 perform set_config('zono.special_write','off',true);perform set_config('zono.financial_write','off',true);return v_result;
end $$;
revoke all on function public.cancel_special_financial_operation(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.cancel_special_financial_operation(uuid,uuid,uuid,integer,text) to service_role;
create or replace function public.guard_special_operation_update()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.operation_type in ('custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count') and coalesce(current_setting('zono.special_write',true),'off')<>'on' then raise exception 'Esta operación se corrige desde su circuito específico, mediante anulación.';end if;return new;
end $$;
drop trigger if exists financial_operations_special_guard on public.financial_operations;
create trigger financial_operations_special_guard before update or delete on public.financial_operations for each row execute function public.guard_special_operation_update();
create or replace function public.guard_custody_account_write()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new uuid;v_old uuid;
begin
 if tg_op<>'DELETE' then v_new:=new.financial_account_id;end if;
 if tg_op<>'INSERT' then v_old:=old.financial_account_id;end if;
 if coalesce(current_setting('zono.special_write',true),'off')<>'on' and exists(select 1 from financial_custody_funds where status='open' and (account_id=v_new or account_id=v_old)) then raise exception 'La cuenta está bajo custodia: registrá la operación desde su fondo.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists cash_transactions_custody_guard on public.cash_transactions;
create trigger cash_transactions_custody_guard before insert or update or delete on public.cash_transactions for each row execute function public.guard_custody_account_write();
create or replace function public.guard_planning_financial_operation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.cash_transaction_id is not null and exists(select 1 from cash_transactions t left join financial_operations o on o.id=t.operation_id where t.id=new.cash_transaction_id and (t.reversal_of_transaction_id is not null or o.status='cancelled' or o.operation_type in ('internal_transfer','custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count'))) then raise exception 'Esta operación compuesta o anulada no puede conciliar una obligación.';end if;return new;
end $$;
notify pgrst,'reload schema';
commit;
