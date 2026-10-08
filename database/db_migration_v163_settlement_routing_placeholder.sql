begin;
-- A routing placeholder must not override the outcome shown in logistics.
create or replace function public.settlement_delivery_status(p_status text, p_failure_reason text)
returns text language sql immutable set search_path = public, pg_temp as $$
 select case
  when lower(trim(coalesce(p_status,''))) in ('entregado','entregada') then p_status
  when lower(trim(coalesce(p_failure_reason,''))) in ('pendiente_ruteo','pendiente ruteo')
   then case when lower(trim(coalesce(p_status,'')))='fallido' then 'Entregando' else coalesce(p_status,'') end
  when lower(coalesce(p_failure_reason,'')) ~ '(postergad|anulad|cancelad|no entregad|fallid|pendiente[_ ]ruteo)' then p_failure_reason
  else coalesce(p_status,'') end;
$$;
commit;
