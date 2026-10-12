begin;
-- Reserve statements are evidence only; this collector never writes the ledger.
create table if not exists public.mp_reserve_web_rows (
 id uuid primary key default gen_random_uuid(),mp_account_id text not null references public.mp_accounts(id),reserve_id uuid not null,
 capture_key text not null,occurred_at timestamptz not null,amount numeric(15,2) not null check(amount<>0),description text not null,
 kind text not null check(kind in ('deposit','withdrawal','yield')),occurrence integer not null check(occurrence between 1 and 200),
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),unique(mp_account_id,reserve_id,capture_key)
);
create table if not exists public.mp_reserve_web_scans (
 id bigint generated always as identity primary key,mp_account_id text not null references public.mp_accounts(id),reserve_id uuid not null,
 scanned_at timestamptz not null default now(),row_count integer not null,visible_from timestamptz,visible_to timestamptz,
 coverage text not null default 'loaded_rows_only' check(coverage='loaded_rows_only')
);
create index if not exists mp_reserve_history_idx on public.mp_reserve_web_rows(mp_account_id,reserve_id,occurred_at);
alter table public.mp_reserve_web_rows enable row level security;alter table public.mp_reserve_web_scans enable row level security;
revoke all on public.mp_reserve_web_rows,public.mp_reserve_web_scans from public,anon,authenticated;
grant all on public.mp_reserve_web_rows,public.mp_reserve_web_scans to service_role;
grant usage,select on sequence public.mp_reserve_web_scans_id_seq to service_role;
create or replace function public.capture_mp_reserve_web(p_mp text,p_reserve uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb;t timestamptz;v numeric;kind text;key text;n integer:=0;first_time timestamptz;last_time timestamptz;
begin
 if p_mp is distinct from 'diegozono_mp' or p_reserve is distinct from '000101a7-1f12-4102-9d9e-871da7f7b326'::uuid then raise exception 'Reserva no configurada';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>200 then raise exception 'Captura inválida: hasta 200 filas';end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if coalesce(item->>'occurredAt','') !~ '^202[0-9]-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00-03:00$' or coalesce(item->>'amount','') !~ '^-?[0-9]+\.[0-9]{2}$'
  or coalesce(item->>'occurrence','') !~ '^[0-9]{1,3}$' or length(coalesce(item->>'description','')) not between 1 and 200 then raise exception 'Fila de reserva inválida';end if;
  t:=(item->>'occurredAt')::timestamptz;v:=(item->>'amount')::numeric;kind:=item->>'kind';
  if t<'2026-09-28T00:00:00-03:00'::timestamptz or t>clock_timestamp()+interval '1 day' or v=0 or (item->>'occurrence')::integer not between 1 and 200
  or kind is null or kind not in ('deposit','withdrawal','yield') or (kind='withdrawal' and v>=0) or (kind in ('deposit','yield') and v<=0) then raise exception 'Fecha, tipo o importe de reserva inválido';end if;
  key:=md5(jsonb_build_array(t,v,kind,item->>'description',(item->>'occurrence')::integer)::text);
  insert into mp_reserve_web_rows(mp_account_id,reserve_id,capture_key,occurred_at,amount,description,kind,occurrence)
  values(p_mp,p_reserve,key,t,v,item->>'description',kind,(item->>'occurrence')::integer)
  on conflict(mp_account_id,reserve_id,capture_key) do update set last_seen_at=now();
  n:=n+1;first_time:=least(first_time,t);last_time:=greatest(last_time,t);
 end loop;
 insert into mp_reserve_web_scans(mp_account_id,reserve_id,row_count,visible_from,visible_to) values(p_mp,p_reserve,n,first_time,last_time);
 return jsonb_build_object('captured',n,'financialWrites',0,'coverage','loaded_rows_only');
end $$;
revoke all on function public.capture_mp_reserve_web(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.capture_mp_reserve_web(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
