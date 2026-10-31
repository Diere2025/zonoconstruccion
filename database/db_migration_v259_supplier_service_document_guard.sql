begin;
create function public.guard_supplier_service_purchase() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from supplier_service_documents where purchase_id=old.id) and current_setting('zono.service_write',true) is distinct from 'on' then
  if tg_op='DELETE' then raise exception 'Conservá el servicio y anulalo desde su circuito con motivo.';end if;
  if new.total_amount is distinct from old.total_amount or new.currency is distinct from old.currency or new.supplier_id is distinct from old.supplier_id
   or new.document_type is distinct from old.document_type or new.invoice_number is distinct from old.invoice_number or new.purchase_date is distinct from old.purchase_date
   or new.purchase_reception_id is distinct from old.purchase_reception_id or (new.status='Anulado' and old.status<>'Anulado') then
   raise exception 'Corregí el servicio desde su circuito: liberá aplicaciones, anulalo con motivo y registrá el comprobante correcto.';
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger supplier_service_purchase_guard before update or delete on supplier_purchases for each row execute function guard_supplier_service_purchase();
revoke all on function guard_supplier_service_purchase() from public,anon,authenticated;
grant execute on function guard_supplier_service_purchase() to service_role;
do $patch$
declare definition text;anchor text:='existing.version<>(p_payload->>''version'')::integer';
begin
 select pg_get_functiondef('save_supplier_service(uuid,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Revisar control de versión del servicio.';end if;
 execute replace(definition,anchor,'existing.version is distinct from (p_payload->>''version'')::integer');
end $patch$;
commit;
