begin;
-- Accept only explicitly configured account/reserve pairs.
create or replace function public.capture_mp_reserve_web(p_mp text,p_reserve uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb;t timestamptz;v numeric;kind text;key text;n integer:=0;first_time timestamptz;last_time timestamptz;
begin
 if not exists(select 1 from mp_reserve_accounts where mp_account_id=p_mp and reserve_id=p_reserve and enabled) then raise exception 'Reserva no configurada';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>200 then raise exception 'Captura inválida: hasta 200 filas';end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if coalesce(item->>'occurredAt','') !~ '^202[0-9]-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00-03:00$' or coalesce(item->>'amount','') !~ '^-?[0-9]+\.[0-9]{2}$'
  or coalesce(item->>'occurrence','') !~ '^[0-9]{1,3}$' or length(coalesce(item->>'description','')) not between 1 and 200 then raise exception 'Fila de reserva inválida';end if;
  t:=(item->>'occurredAt')::timestamptz;v:=(item->>'amount')::numeric;kind:=item->>'kind';
  if (t at time zone 'America/Argentina/Buenos_Aires')::date<(select history_from from mp_reserve_accounts where mp_account_id=p_mp and reserve_id=p_reserve) or t>clock_timestamp()+interval '1 day' or v=0 or (item->>'occurrence')::integer not between 1 and 200
  or kind is null or kind not in ('deposit','withdrawal','yield') or (kind='withdrawal' and v>=0) or (kind in ('deposit','yield') and v<=0) then raise exception 'Fecha, tipo o importe de reserva inválido';end if;
  -- The initial deposit is independently confirmed by its unique bank pair.
  -- Activity and Savings may label that same deposit differently.
  if p_mp='pagoszono_26' and p_reserve='7b241292-a4d8-46ca-9fa2-9ea6b61427fa'::uuid
   and t='2026-10-22T12:31:00-03:00'::timestamptz and v=447200 and kind='deposit'
   and lower(item->>'description') in ('dinero reservado','dinero ingresado','dinero agregado','dinero depositado') then
   item:=jsonb_set(item,'{description}',to_jsonb('Dinero reservado'::text));
  end if;
  key:=md5(jsonb_build_array(t,v,kind,item->>'description',(item->>'occurrence')::integer)::text);
  insert into mp_reserve_web_rows(mp_account_id,reserve_id,capture_key,occurred_at,amount,description,kind,occurrence)
  values(p_mp,p_reserve,key,t,v,item->>'description',kind,(item->>'occurrence')::integer)
  on conflict(mp_account_id,reserve_id,capture_key) do update set last_seen_at=now();
  n:=n+1;first_time:=least(first_time,t);last_time:=greatest(last_time,t);
 end loop;
 insert into mp_reserve_web_scans(mp_account_id,reserve_id,row_count,visible_from,visible_to) values(p_mp,p_reserve,n,first_time,last_time);
 perform sync_mp_reserve_ledger(p_mp);
 return jsonb_build_object('captured',n,'financialWrites',0,'coverage','loaded_rows_only');
end $$;
revoke all on function public.capture_mp_reserve_web(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.capture_mp_reserve_web(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
