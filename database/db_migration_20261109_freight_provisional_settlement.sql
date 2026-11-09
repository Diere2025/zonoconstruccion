begin;
alter table public.logistics_freight_settlement_terms add column if not exists provisional boolean not null default false;

-- Derive provisional/final status from the locked plan, never from a client flag.
create or replace function public.set_logistics_settlement_stage() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare stage text;
begin
 select status into stage from logistics_dispatch_plans where dispatch_id=new.dispatch_id for update;
 if stage not in ('in_progress','completed') or stage is null then raise exception 'La salida debe estar en recorrido o cerrada';end if;
 new.provisional=(stage='in_progress');
 return new;
end$$;
revoke all on function public.set_logistics_settlement_stage() from public,anon,authenticated;
drop trigger if exists logistics_settlement_stage on public.logistics_freight_settlement_terms;
create trigger logistics_settlement_stage before insert or update on public.logistics_freight_settlement_terms for each row execute function public.set_logistics_settlement_stage();

do $$declare definition text; signature text; needle text; replacement text;begin
 for signature,needle,replacement in select * from (values
 ('public.save_logistics_freight_settlement_terms(uuid,uuid,integer,jsonb)', 'and status=''completed''', 'and status in (''in_progress'',''completed'')'),
 ('public.pay_logistics_freight(uuid,uuid,jsonb,jsonb)', 'and p.status=''completed''', 'and p.status in (''in_progress'',''completed'')'),
 ('public.allocate_logistics_freight_payment(uuid,uuid,jsonb,jsonb,jsonb)', 'and p.status=''completed''', 'and p.status in (''in_progress'',''completed'')'),
 ('public.ensure_logistics_review_task(uuid,uuid)', 'plan.status<>''completed''', 'plan.status not in (''in_progress'',''completed'')'),
 ('public.confirm_logistics_payment_task(uuid,uuid,integer,jsonb,text)', 'plan.status<>''completed''', 'plan.status not in (''in_progress'',''completed'')')
 ) changes(signature,needle,replacement) loop
  definition=pg_get_functiondef(signature::regprocedure);
  if position(replacement in definition)=0 then
   if position(needle in definition)=0 then raise exception 'No se encontró la validación en %',signature;end if;
   definition=replace(definition,needle,replacement);
  end if;
  definition=replace(definition,'La salida debe estar cerrada','La salida debe estar en recorrido o cerrada');
  definition=replace(definition,'La salida no está cerrada','La salida debe estar en recorrido o cerrada');
  definition=replace(definition,'La tarea requiere un cierre del ERP','La tarea requiere una salida del ERP en recorrido o cerrada');
  definition=replace(definition,'La tarea requiere una salida del ERP cerrada','La tarea requiere una salida del ERP en recorrido o cerrada');
  definition=replace(definition,'Salida cerrada. Revisar costo','Liquidación provisoria durante el recorrido; revisión definitiva al cierre. Revisar costo');
  execute definition;
 end loop;
 definition=pg_get_functiondef('public.pay_logistics_freight(uuid,uuid,jsonb,jsonb)'::regprocedure);
 needle='if term.extra_snapshot is distinct from';
 replacement='if term.provisional and exists(select 1 from logistics_dispatch_plans where dispatch_id=target and status=''completed'') then raise exception ''Confirmá la liquidación definitiva antes de otro pago'';end if;
  if term.extra_snapshot is distinct from';
 if position('Confirmá la liquidación definitiva antes de otro pago' in definition)=0 then
  if position(needle in definition)=0 then raise exception 'No se encontró la validación de extras';end if;
  execute replace(definition,needle,replacement);
 end if;
 definition=pg_get_functiondef('public.accept_logistics_freight_difference(uuid,uuid,integer,numeric,text)'::regprocedure);
 needle='if not exists(select 1 from logistics_dispatch_plans';
 replacement='if term.provisional then raise exception ''Confirmá la liquidación definitiva antes de aceptar diferencias'';end if;
 if not exists(select 1 from logistics_dispatch_plans';
 if position('Confirmá la liquidación definitiva antes de aceptar diferencias' in definition)=0 then
  if position(needle in definition)=0 then raise exception 'No se encontró la validación de diferencias';end if;
  execute replace(definition,needle,replacement);
 end if;
end$$;
notify pgrst,'reload schema';
commit;
