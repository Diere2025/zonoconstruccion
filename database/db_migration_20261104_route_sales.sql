begin;
create table if not exists public.route_sales_config (
 id boolean primary key default true check(id), enabled boolean not null default false,
 seller_id uuid not null default '13430e05-b61a-4a3f-9fc3-152d377c4b0c',
 seller_name text not null default 'Jazmín',
 whaticket_user_id text, model text not null default 'gpt-4.1',
 weekdays integer[] not null default array[1,2,3,4,5,6]
);
alter table public.route_sales_config enable row level security;
revoke all on public.route_sales_config from anon,authenticated;
grant all on public.route_sales_config to service_role;
insert into public.route_sales_config(id) values(true) on conflict do nothing;
create table if not exists public.route_sales (
 id uuid primary key default gen_random_uuid(),
 source text not null check(source in ('whaticket','manual','erp')),
 source_key text not null unique,
 ticket_id text,
 seller_id uuid references public.sellers(id),
 seller_name text not null,
 customer_name text,
 summary text not null,
 locality text not null,
 date_label text not null,
 available_from date,
 availability_uncertain boolean not null default false,
 evidence_ids jsonb not null default '[]',
 whaticket_link text,
 status text not null default 'review' check(status in ('review','pending','loaded','cancelled')),
 order_id uuid references public.orders(id),
 order_code text,
 telegram_chat_id text not null default '-1002044363540',
 telegram_message_id bigint,
 telegram_hash text,
 delivery_state text not null default 'idle' check(delivery_state in ('idle','editing','sending','uncertain')),
 delivery_started_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists route_sales_ticket on public.route_sales(ticket_id);
create index if not exists route_sales_order on public.route_sales(order_id);
alter table public.route_sales enable row level security;
revoke all on public.route_sales from anon,authenticated;
grant all on public.route_sales to service_role;

create table if not exists public.route_sales_chats (
 ticket_id text primary key,
 input_hash text,
 analysis jsonb,
 audio_transcripts jsonb not null default '{}',
 last_error text,
 checked_at timestamptz not null default now()
);
alter table public.route_sales_chats enable row level security;
revoke all on public.route_sales_chats from anon,authenticated;
grant all on public.route_sales_chats to service_role;

create table if not exists public.route_sales_runs (
 id uuid primary key default gen_random_uuid(), run_key text not null unique,
 status text not null default 'running', started_at timestamptz not null default now(),
 finished_at timestamptz, summary jsonb, error text
);
alter table public.route_sales_runs enable row level security;
revoke all on public.route_sales_runs from anon,authenticated;
grant all on public.route_sales_runs to service_role;

create or replace function public.claim_route_sales_run(p_key text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(741104);
 update route_sales_runs set status='failed',finished_at=now(),error='Ejecución interrumpida'
 where status='running' and started_at < now()-interval '14 minutes';
 if exists(select 1 from route_sales_runs where status='running') then return null; end if;
 insert into route_sales_runs(run_key) values(p_key) on conflict do nothing returning id into result;
 return result;
end $$;

create or replace function public.claim_route_sale_notice(p_id uuid) returns setof public.route_sales
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- A timed-out send must be reconciled; never resend blindly.
 update route_sales set delivery_state=case when delivery_state='sending' then 'uncertain' else 'idle' end,
 last_error='Aviso interrumpido: verificar en Telegram' where id=p_id
 and delivery_state in ('sending','editing') and delivery_started_at < now()-interval '10 minutes';
 return query update route_sales set delivery_state=case when telegram_message_id is null then 'sending' else 'editing' end,
 delivery_started_at=now() where id=p_id and delivery_state='idle' and status <> 'review' returning *;
end $$;

create or replace function public.link_route_sale_order(p_link text,p_code text,p_seller text,p_summary text,p_locality text,p_date text,p_from date)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare candidates uuid[]; result uuid; matched_order uuid; ticket text;
begin
 perform pg_advisory_xact_lock(741105);
 select id into matched_order from orders where legacy_code=p_code order by created_at desc limit 1;
 select id into result from route_sales where order_code=p_code limit 1;
 if result is not null then return result; end if;
 ticket := substring(p_link from '/tickets/([a-fA-F0-9-]{36})');
 if ticket is not null then
  select array_agg(id) into candidates from route_sales where ticket_id=ticket and status in ('pending','review') and order_code is null;
  if cardinality(candidates)>1 then raise exception 'Hay varias ventas en este chat: vincular el aviso correcto antes de publicar'; end if;
  if cardinality(candidates)=1 then
   result:=candidates[1];
   update route_sales set order_code=p_code,order_id=matched_order,status='loaded',updated_at=now() where id=result;
   return result;
  end if;
 end if;
 insert into route_sales(source,source_key,ticket_id,seller_name,summary,locality,date_label,available_from,whaticket_link,status,order_code,order_id)
 values('erp','erp:'||p_code,ticket,coalesce(nullif(p_seller,''),'Vendedor/a'),p_summary,p_locality,p_date,p_from,nullif(p_link,''),'loaded',p_code,matched_order)
 returning id into result;
 return result;
end $$;

revoke all on function public.claim_route_sales_run(text), public.claim_route_sale_notice(uuid),public.link_route_sale_order(text,text,text,text,text,text,date) from public,anon,authenticated;
grant execute on function public.claim_route_sales_run(text), public.claim_route_sale_notice(uuid),public.link_route_sale_order(text,text,text,text,text,text,date) to service_role;

-- Share the ERP reconciliation lock: a concurrent interpretation cannot
-- restore pending status or publish a second notice after ERP entry.
create or replace function public.upsert_detected_route_sale(p_sale jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_sale route_sales; parsed route_sales; result uuid;
begin
 perform pg_advisory_xact_lock(741105);
 select * into current_sale from route_sales where source_key=p_sale->>'source_key';
 if found and current_sale.order_code is not null then return current_sale.id; end if;
 if current_sale.id is null and exists(select 1 from route_sales where ticket_id=p_sale->>'ticket_id' and status<>'cancelled') then return null; end if;
 parsed:=jsonb_populate_record(null::route_sales,p_sale);
 insert into route_sales(source,source_key,ticket_id,seller_id,seller_name,summary,locality,date_label,available_from,availability_uncertain,evidence_ids,whaticket_link,status)
 values('whaticket',parsed.source_key,parsed.ticket_id,parsed.seller_id,parsed.seller_name,parsed.summary,parsed.locality,parsed.date_label,parsed.available_from,parsed.availability_uncertain,parsed.evidence_ids,parsed.whaticket_link,parsed.status)
 on conflict(source_key) do update set summary=excluded.summary,locality=excluded.locality,date_label=excluded.date_label,
 available_from=excluded.available_from,availability_uncertain=excluded.availability_uncertain,evidence_ids=excluded.evidence_ids,status=excluded.status,updated_at=now()
 where route_sales.order_code is null returning id into result;
 return result;
end $$;
revoke all on function public.upsert_detected_route_sale(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_detected_route_sale(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
