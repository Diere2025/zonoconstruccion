begin;
-- Explicit settlement of a small difference is not a payment, discount or debt recovery.
alter table public.logistics_freight_settlement_terms add column if not exists difference_acceptance jsonb;
create or replace function public.accept_logistics_freight_difference(p_actor uuid,p_dispatch uuid,p_version integer,p_paid numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare term logistics_freight_settlement_terms; paid numeric; delta numeric; saved logistics_freight_settlement_terms;
begin
 if not coalesce(can_manage_financial_operations(p_actor),false) then raise exception 'Sin permiso de Tesorería' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('sync_logistics_dispatch_links'));
 select * into term from logistics_freight_settlement_terms where dispatch_id=p_dispatch for update;
 if not found or term.version is distinct from p_version then raise exception 'El saldo cambió. Actualizá.' using errcode='40001';end if;
 if not exists(select 1 from logistics_dispatch_plans where dispatch_id=p_dispatch and status='completed' and coalesce(actual->'extras','[]')=term.extra_snapshot) then raise exception 'Confirmá los extras y el servicio cerrado antes de aceptar la diferencia';end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Indicá un motivo de hasta 500 caracteres';end if;
 select coalesce(sum(coalesce(a.amount,t.amount)),0) into paid from cash_transactions t
 left join logistics_freight_payment_allocations a on a.transaction_id=t.id and a.dispatch_id=p_dispatch
 where t.type='egreso' and t.currency='ARS' and t.reversal_of_transaction_id is null and not exists(select 1 from cash_transactions r where r.reversal_of_transaction_id=t.id)
 and (a.dispatch_id is not null or not exists(select 1 from logistics_freight_payment_allocations x where x.transaction_id=t.id) and exists(select 1 from logistics_dispatch_movements l where l.transaction_id=t.id and l.dispatch_id=p_dispatch and l.purpose='freight_fee'));
 delta=paid-term.net_amount;
 if paid is distinct from p_paid then raise exception 'Los pagos cambiaron. Actualizá.' using errcode='40001';end if;
 if paid<=0 or delta=0 or abs(delta)>500 then raise exception 'Sólo se pueden aceptar diferencias de hasta $500 sobre un pago registrado';end if;
 update logistics_freight_settlement_terms set difference_acceptance=jsonb_build_object('version',version+1,'paidAmount',paid,'netAmount',net_amount,'difference',delta,'reason',trim(p_reason),'actor',p_actor,'acceptedAt',now()),version=version+1,updated_at=now() where dispatch_id=p_dispatch returning * into saved;
 insert into logistics_freight_accounting_events(actor_id,dispatch_id,kind,previous_data,new_data) values(p_actor,p_dispatch,'minor_difference_accepted',to_jsonb(term),to_jsonb(saved));
 return to_jsonb(saved);
end$$;
revoke all on function public.accept_logistics_freight_difference(uuid,uuid,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.accept_logistics_freight_difference(uuid,uuid,integer,numeric,text) to service_role;
-- The write-side guard must also reject another payment after accepting the residual.
do $$declare definition text; needle text; guard text;begin
 definition=pg_get_functiondef('public.pay_logistics_freight(uuid,uuid,jsonb,jsonb)'::regprocedure);
 needle='if (part->>''amount'')::numeric<=0';
 guard='if term.difference_acceptance is not null and (term.difference_acceptance->>''version'')::integer=term.version and (term.difference_acceptance->>''paidAmount'')::numeric=paid and (term.difference_acceptance->>''netAmount'')::numeric=term.net_amount and (term.difference_acceptance->>''difference'')::numeric=paid-term.net_amount then raise exception ''El LOG ya fue liquidado con una diferencia aceptada'';end if;';
 if position(guard in definition)=0 then
  if position(needle in definition)=0 then raise exception 'No se encontró la validación de saldo del pago de fletes';end if;
  execute replace(definition,needle,guard||chr(10)||'  '||needle);
 end if;
end$$;
notify pgrst,'reload schema';
commit;
