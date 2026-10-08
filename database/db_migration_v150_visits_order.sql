alter table public.visit_cases add column if not exists locality_id uuid references public.localities(id);
create table if not exists public.visit_commercial_data(case_id uuid primary key references public.visit_cases(id),whaticket_link text not null default '',updated_by uuid references public.sellers(id),updated_at timestamptz not null default now());
alter table public.visit_commercial_data enable row level security;
revoke all on public.visit_commercial_data from public,anon,authenticated;
grant select on public.visit_commercial_data to authenticated;
drop policy if exists visit_commercial_read on public.visit_commercial_data;
create policy visit_commercial_read on public.visit_commercial_data for select to authenticated using((select public.visits_active()) and (select public.visits_commercial()));
-- Extend the existing atomic command without leaking the private URL into shared history.
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 if position('-- v150 commercial fields' in definition)=0 then
   definition:=replace(definition,' if p_command<>''create'' then update public.visit_cases set version=', $patch$
 -- v150 commercial fields
 if p_command in ('create','edit') then
   if nullif(p_data->>'locality_id','') is not null then
     if not exists(select 1 from public.localities where id=(p_data->>'locality_id')::uuid and is_active=true) then raise exception 'VISITS_INVALID'; end if;
     update public.visit_cases set locality_id=(p_data->>'locality_id')::uuid,locality=(select name from public.localities where id=(p_data->>'locality_id')::uuid) where id=p_case;
   else update public.visit_cases set locality_id=null where id=p_case; end if;
   if p_data ? 'whaticket_link' then
     if not commercial or length(coalesce(p_data->>'whaticket_link',''))>3000 or (coalesce(p_data->>'whaticket_link','')<>'' and p_data->>'whaticket_link' !~ '^https?://') then raise exception 'VISITS_INVALID'; end if;
     insert into public.visit_commercial_data(case_id,whaticket_link,updated_by) values(p_case,coalesce(p_data->>'whaticket_link',''),actor) on conflict(case_id) do update set whaticket_link=excluded.whaticket_link,updated_by=actor,updated_at=now();
   end if;
 end if;
 p_data:=p_data-'whaticket_link';
 if p_command<>'create' then update public.visit_cases set version=$patch$);
   if position('-- v150 commercial fields' in definition)=0 then raise exception 'Unexpected visits command definition'; end if;
   execute definition;
 end if;
end $$;

alter table public.orders add column if not exists source_visit_id uuid references public.visit_cases(id);
alter table public.orders add column if not exists source_visit_quote_id uuid references public.visit_quotes(id);
create unique index if not exists orders_source_visit_unique on public.orders(source_visit_id) where source_visit_id is not null;
create or replace function public.visits_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.visit_cases%rowtype; actor uuid; q public.visit_quotes%rowtype; begin
 if tg_op='UPDATE' then if new.source_visit_id is distinct from old.source_visit_id or new.source_visit_quote_id is distinct from old.source_visit_quote_id then raise exception 'VISITS_INVALID'; end if; return new; end if;
 if new.source_visit_id is null then return new; end if;
 actor:=public.visits_profile();
 if actor is null and current_setting('role',true)='service_role' then actor:=new.created_by_id; end if;
 if actor is null or not exists(select 1 from public.sellers where id=actor and is_active and (coalesce(roles,array[]::text[])||array[role]) && array['seller','admin']) then raise exception 'VISITS_FORBIDDEN'; end if;
 if new.created_by_id is distinct from actor then raise exception 'VISITS_FORBIDDEN'; end if;
 select * into t from public.visit_cases where id=new.source_visit_id for update;
 if not found then raise exception 'VISITS_NOT_FOUND'; end if;
 if exists(select 1 from public.visit_order_links where case_id=t.id) then raise exception 'VISITS_ORDER_EXISTS'; end if;
 select * into q from public.visit_quotes where id=t.quote_id and id=new.source_visit_quote_id and status='accepted';
 if not found then raise exception 'VISITS_QUOTE_ACCEPTED_REQUIRED'; end if;
 return new;
end $$;
create or replace function public.visits_order_link_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_visit_id is not null then
   insert into public.visit_order_links(case_id,order_id,reference) values(new.source_visit_id,new.id,coalesce(nullif(new.legacy_code,''),new.id::text));
   insert into public.visit_events(case_id,actor_id,kind,body,data) values(new.source_visit_id,new.created_by_id,'order_link','Pedido creado desde la visita',jsonb_build_object('input',jsonb_build_object('order_id',new.id,'quote_id',new.source_visit_quote_id)));
   update public.visit_cases set version=version+1,updated_at=now() where id=new.source_visit_id;
 end if; return new;
end $$;
revoke all on function public.visits_order_guard(),public.visits_order_link_created() from public,anon,authenticated;
drop trigger if exists visits_order_guard on public.orders;
create trigger visits_order_guard before insert or update of source_visit_id,source_visit_quote_id on public.orders for each row execute function public.visits_order_guard();
drop trigger if exists visits_order_link_created on public.orders;
create trigger visits_order_link_created after insert on public.orders for each row execute function public.visits_order_link_created();
notify pgrst,'reload schema';
