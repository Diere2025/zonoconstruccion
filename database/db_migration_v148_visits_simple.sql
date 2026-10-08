-- Ejecutar en una transacción. Extiende visitas sin alterar pedidos/finanzas.
alter table public.visit_cases add column if not exists initial_installation_amount numeric(15,2) check(initial_installation_amount between 0 and 100000000);
alter table public.visit_cases add column if not exists visit_fee numeric(15,2) not null default 0 check(visit_fee between 0 and 100000000);
alter table public.visit_cases add column if not exists discount_visit_fee boolean not null default true;
alter table public.visit_cases add column if not exists extras text not null default '' check(length(extras)<=6000);

create or replace function public.visits_kit(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
 select jsonb_build_object('id',id,'name',name,'sku',sku,'price',price) into r from public.products
 where id=p_id and (is_active is distinct from false or id='f3eebe3d-ed24-4801-b315-db5cd5011a72') and lower(name) like '%kit instalaci%' and lower(name) not like '%adicional%';
 if r is null then raise exception 'VISITS_KIT_REQUIRED'; end if; return r;
end $$;
create or replace function public.visits_resolve_kit(p_data jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare label text:=trim(coalesce(p_data->>'custom_kit','')); begin
 if p_data->>'kit_id'='other' then
   if length(label) not between 1 and 300 then raise exception 'VISITS_KIT_REQUIRED'; end if;
   return jsonb_build_object('id',md5('visits-custom:'||label)::uuid,'name',label,'sku',null,'price',0,'custom',true);
 end if;
 return public.visits_kit(nullif(p_data->>'kit_id','')::uuid);
end $$;
revoke all on function public.visits_resolve_kit(jsonb) from public,anon,authenticated;
create or replace function public.visits_session() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
 if not public.visits_active() then raise exception 'VISITS_FORBIDDEN'; end if;
 select jsonb_build_object('id',s.id,'name',s.full_name,'commercial',public.visits_commercial(),'administrator','admin'=any(public.visits_roles()),
 'default_installer_id',(select id from public.sellers where lower(trim(email))='juan.herrera@zono.com.ar' and is_active is true and (coalesce(roles,array[]::text[])||array[role]) @> array['instalador'] limit 1),
 'people',public.visits_people(),'kits',coalesce((select jsonb_agg(public.visits_kit(p.id) order by p.name) from public.products p where (p.is_active is distinct from false or p.id='f3eebe3d-ed24-4801-b315-db5cd5011a72') and lower(p.name) like '%kit instalaci%' and lower(p.name) not like '%adicional%'),'[]')) into r
 from public.sellers s where s.id=public.visits_profile(); return r;
end $$;

create table if not exists public.visit_slots(
 id uuid primary key default gen_random_uuid(), installer_id uuid not null references public.sellers(id), case_id uuid references public.visit_cases(id),
 kind text not null check(kind in ('installation','available','blocked')), date date not null, start_time time not null,end_time time not null check(end_time>start_time),
 title text not null check(length(trim(title)) between 1 and 300), cancelled boolean not null default false,created_by uuid not null references public.sellers(id),created_at timestamptz not null default now()
);
alter table public.visit_slots enable row level security;
drop policy if exists visits_slots_read on public.visit_slots;
create policy visits_slots_read on public.visit_slots for select to authenticated using(public.visits_active() and (public.visits_commercial() or installer_id=public.visits_profile()));
revoke all on public.visit_slots from public,anon,authenticated; grant select on public.visit_slots to authenticated;
create or replace function public.visits_save_slot(p_key uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.visits_profile(); person uuid:=nullif(p_data->>'installer_id','')::uuid; cid uuid:=nullif(p_data->>'case_id','')::uuid; r uuid; begin
 if not public.visits_active() or (not public.visits_commercial() and person is distinct from actor) then raise exception 'VISITS_FORBIDDEN'; end if;
 if not exists(select 1 from public.sellers where id=person and is_active and (coalesce(roles,array[]::text[])||array[role]) @> array['instalador']) then raise exception 'VISITS_PERSON_INVALID'; end if;
 if cid is not null and not public.visits_can_read(cid) then raise exception 'VISITS_NOT_FOUND'; end if;
 if length(trim(coalesce(p_data->>'title',''))) not between 1 and 300 or p_data->>'kind' not in ('installation','available','blocked') or nullif(p_data->>'date','')::date is null or nullif(p_data->>'start_time','')::time is null or nullif(p_data->>'end_time','')::time is null then raise exception 'VISITS_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(person::text||(p_data->>'date'),148));
 if p_data->>'kind'<>'available' and (exists(select 1 from public.visit_appointments a join public.visit_cases c on c.id=a.case_id where c.installer_id=person and a.date=(p_data->>'date')::date and a.status in ('proposed','confirmed') and a.start_time<(p_data->>'end_time')::time and a.end_time>(p_data->>'start_time')::time)
 or exists(select 1 from public.visit_slots s where s.installer_id=person and s.date=(p_data->>'date')::date and s.kind<>'available' and not cancelled and s.id<>p_key and s.start_time<(p_data->>'end_time')::time and s.end_time>(p_data->>'start_time')::time)) then raise exception 'VISITS_SCHEDULE_CONFLICT'; end if;
 insert into public.visit_slots(id,installer_id,case_id,kind,date,start_time,end_time,title,created_by) values(p_key,person,cid,p_data->>'kind',(p_data->>'date')::date,(p_data->>'start_time')::time,(p_data->>'end_time')::time,trim(p_data->>'title'),actor) on conflict(id) do nothing returning id into r;
 if r is null then
   if not exists(select 1 from public.visit_slots where id=p_key and created_by=actor and installer_id=person and case_id is not distinct from cid and kind=p_data->>'kind' and date=(p_data->>'date')::date and start_time=(p_data->>'start_time')::time and end_time=(p_data->>'end_time')::time and title=trim(p_data->>'title')) then raise exception 'VISITS_CONFLICT'; end if;
   r:=p_key;
 end if; return r;
end $$;
create or replace function public.visits_cancel_slot(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.visits_active() then raise exception 'VISITS_FORBIDDEN'; end if;
 update public.visit_slots set cancelled=true where id=p_id and (public.visits_commercial() or installer_id=public.visits_profile());
 if not found then raise exception 'VISITS_NOT_FOUND'; end if;
end $$;
revoke all on function public.visits_save_slot(uuid,jsonb),public.visits_cancel_slot(uuid) from public,anon;
grant execute on function public.visits_save_slot(uuid,jsonb),public.visits_cancel_slot(uuid) to authenticated;

create table if not exists public.visit_integration_settings(id boolean primary key default true check(id),public_url text not null default '',telegram_chat_id text not null default '',visits_calendar_id text not null default '',installations_calendar_id text not null default '');
insert into public.visit_integration_settings(id) values(true) on conflict do nothing;
alter table public.visit_integration_settings enable row level security;
revoke all on public.visit_integration_settings from public,anon,authenticated;
create table if not exists public.visit_delivery_jobs(id uuid primary key default gen_random_uuid(),event_id uuid,case_id uuid references public.visit_cases(id),slot_id uuid references public.visit_slots(id),channel text not null check(channel in ('telegram','google')),state text not null default 'pending' check(state in ('pending','processing','done','error','unknown')),message text not null default '',created_at timestamptz not null default now(),unique(event_id,channel));
alter table public.visit_delivery_jobs enable row level security;
revoke all on public.visit_delivery_jobs from public,anon,authenticated;
create or replace function public.visits_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='visit_events' then
   if new.kind in ('create','appointment','visit_result','outcome') then
     insert into public.visit_delivery_jobs(event_id,case_id,channel) values(new.id,new.case_id,'telegram') on conflict do nothing;
     if new.kind in ('create','appointment','visit_result') then insert into public.visit_delivery_jobs(event_id,case_id,channel) values(new.id,new.case_id,'google') on conflict do nothing; end if;
   end if;
 else
   insert into public.visit_delivery_jobs(slot_id,channel) values(new.id,'telegram'),(new.id,'google');
 end if; return new;
end $$;
revoke all on function public.visits_enqueue() from public,anon,authenticated;
drop trigger if exists visit_delivery on public.visit_events;
create trigger visit_delivery after insert on public.visit_events for each row execute function public.visits_enqueue();
drop trigger if exists visit_slot_delivery on public.visit_slots;
create trigger visit_slot_delivery after insert or update of cancelled on public.visit_slots for each row execute function public.visits_enqueue();

-- Keep the existing REST guard and extend its installer whitelist.
create or replace function public.visits_rest_guard() returns void language plpgsql security definer set search_path='' as $$
declare path text:=coalesce(current_setting('request.path',true),''); previous text; begin
 if public.visits_limited_installer() and path not in (
 '/rpc/visits_session','/rpc/visits_command','/rpc/visits_list','/rpc/visits_read_notifications','/rpc/visits_mark_read','/rpc/visits_save_slot','/rpc/visits_cancel_slot',
 '/rpc/visits_active','/rpc/visits_limited_installer','/visit_cases','/visit_appointments','/visit_quotes','/visit_events','/visit_order_links','/visit_attachments','/visit_notifications','/visit_slots','/sellers') then raise insufficient_privilege using message='VISITS_FORBIDDEN'; end if;
 select previous_hook into previous from public.visit_guard_config where id;
 if previous is not null and previous<>'public.visits_rest_guard' then execute format('select %s()',previous::regproc); end if;
end $$;
create or replace function public.visits_command(p_command text,p_case uuid,p_key uuid,p_version integer,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=public.visits_profile(); commercial boolean:=public.visits_commercial(); t public.visit_cases%rowtype;
 op public.visit_operations%rowtype; request jsonb:=jsonb_build_object('command',p_command,'case',p_case,'version',p_version,'data',p_data);
 result jsonb; before_data jsonb; ev uuid; body text:=trim(coalesce(p_data->>'body','')); k jsonb;
 ap public.visit_appointments%rowtype; q public.visit_quotes%rowtype; a uuid; line jsonb; total numeric:=0; n integer; field text; person uuid; ref text;
begin
 if not public.visits_active() then raise exception 'VISITS_FORBIDDEN'; end if;
 if p_key is null or jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>40000 then raise exception 'VISITS_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,147));
 select * into op from public.visit_operations where actor_id=actor and key=p_key;
 if found then
   if op.request<>request then raise exception 'VISITS_CONFLICT'; end if;
   if not public.visits_can_read(op.case_id) then raise exception 'VISITS_NOT_FOUND'; end if;
   return op.result;
 end if;
 if p_command in ('create','edit','assign','outcome','order_link','order_unlink') and not commercial then raise exception 'VISITS_FORBIDDEN'; end if;
 if p_command<>'create' then
   if not public.visits_can_read(p_case) then raise exception 'VISITS_NOT_FOUND'; end if;
   select * into t from public.visit_cases where id=p_case for update;
   if p_version is distinct from t.version then raise exception 'VISITS_CONFLICT'; end if;
   before_data:=to_jsonb(t);
   if t.outcome<>'pending' and p_command in ('kit','quote','appointment') then raise exception 'VISITS_REOPEN_REQUIRED'; end if;
 end if;
 foreach field in array array['body','notes','address','maps_url','conditions','exclusions','next_action'] loop
   if p_data ? field and (jsonb_typeof(p_data->field) is distinct from 'string' or length(p_data->>field)>3000) then raise exception 'VISITS_INVALID'; end if;
 end loop;
 if p_command in ('create','edit') then
   foreach field in array array['customer_name','phone','locality','request_reason'] loop
     if jsonb_typeof(p_data->field) is distinct from 'string' or length(trim(p_data->>field)) not between 1 and 500 then raise exception 'VISITS_REQUIRED'; end if;
   end loop;
   if coalesce(p_data->>'maps_url','')<>'' and p_data->>'maps_url' !~ '^https?://' then raise exception 'VISITS_INVALID'; end if;
 end if;
 if p_command in ('create','assign') then
   person:=nullif(p_data->>'seller_id','')::uuid;
   if not exists(select 1 from public.sellers s where s.id=person and s.is_active is true and (coalesce(s.roles,array[]::text[])||array[s.role]) && array['seller','admin']) then raise exception 'VISITS_PERSON_INVALID'; end if;
   person:=nullif(p_data->>'installer_id','')::uuid;
   if person is not null and not exists(select 1 from public.sellers s where s.id=person and s.is_active is true and (coalesce(s.roles,array[]::text[])||array[s.role]) @> array['instalador']) then raise exception 'VISITS_PERSON_INVALID'; end if;
 end if;
 if p_command='create' then
   k:=public.visits_kit(nullif(p_data->>'kit_id','')::uuid);
   insert into public.visit_cases(created_by,customer_name,phone,locality,address,maps_url,request_reason,notes,seller_id,installer_id,interest_kit,next_at,next_owner_id)
   values(actor,trim(p_data->>'customer_name'),trim(p_data->>'phone'),trim(p_data->>'locality'),coalesce(p_data->>'address',''),coalesce(p_data->>'maps_url',''),trim(p_data->>'request_reason'),coalesce(p_data->>'notes',''),(p_data->>'seller_id')::uuid,nullif(p_data->>'installer_id','')::uuid,k,now()+interval '24 hours',coalesce(nullif(p_data->>'installer_id','')::uuid,(p_data->>'seller_id')::uuid)) returning * into t;
   p_case:=t.id; body:=t.request_reason;
   if t.seller_id<>actor then raise exception 'VISITS_PERSON_INVALID'; end if;
   update public.visit_cases set initial_installation_amount=nullif(p_data->>'initial_installation_amount','')::numeric,visit_fee=coalesce(nullif(p_data->>'visit_fee','')::numeric,0),discount_visit_fee=coalesce((p_data->>'discount_visit_fee')::boolean,true),extras=coalesce(p_data->>'extras','') where id=t.id;
   if nullif(p_data->>'scheduled_date','') is not null then
     if t.installer_id is null then raise exception 'VISITS_PERSON_INVALID'; end if;
     insert into public.visit_appointments(case_id,mode,date,start_time,end_time,status,note) values(t.id,'onsite',(p_data->>'scheduled_date')::date,coalesce(nullif(p_data->>'scheduled_time',''),'09:00')::time,coalesce(nullif(p_data->>'scheduled_time',''),'09:00')::time+interval '1 hour','proposed','Horario aproximado indicado al cargar la visita');
   end if;
 elsif p_command='edit' then
   update public.visit_cases set customer_name=trim(p_data->>'customer_name'),phone=trim(p_data->>'phone'),locality=trim(p_data->>'locality'),address=coalesce(p_data->>'address',''),maps_url=coalesce(p_data->>'maps_url',''),request_reason=trim(p_data->>'request_reason'),notes=coalesce(p_data->>'notes','') where id=t.id;
 elsif p_command='extras' then
   update public.visit_cases set extras=coalesce(p_data->>'extras','') where id=t.id; body:=coalesce(p_data->>'extras','');
 elsif p_command='agreement' then
   if not commercial then raise exception 'VISITS_FORBIDDEN'; end if;
   update public.visit_cases set initial_installation_amount=nullif(p_data->>'initial_installation_amount','')::numeric,visit_fee=coalesce(nullif(p_data->>'visit_fee','')::numeric,0),discount_visit_fee=coalesce((p_data->>'discount_visit_fee')::boolean,true) where id=t.id; body:='Valores acordados actualizados';
 elsif p_command='assign' then
   if nullif(p_data->>'installer_id','')::uuid is distinct from t.installer_id and exists(select 1 from public.visit_appointments where case_id=t.id and status='confirmed') then raise exception 'VISITS_REASSIGN_SCHEDULE'; end if;
   update public.visit_cases set seller_id=(p_data->>'seller_id')::uuid,installer_id=nullif(p_data->>'installer_id','')::uuid,
   next_owner_id=case when next_owner_id=installer_id then coalesce(nullif(p_data->>'installer_id','')::uuid,(p_data->>'seller_id')::uuid) when next_owner_id=seller_id then (p_data->>'seller_id')::uuid else next_owner_id end where id=t.id;
 elsif p_command='contact' then
   if p_data->>'result' not in ('attempted','contacted') or length(body)=0 or length(trim(coalesce(p_data->>'channel','')))=0 or length(trim(coalesce(p_data->>'interlocutor','')))=0 or nullif(p_data->>'at','')::timestamptz is null then raise exception 'VISITS_REQUIRED'; end if;
   update public.visit_cases set contact_status=case when contact_status='contacted' then 'contacted' else p_data->>'result' end where id=t.id;
 elsif p_command='kit' then
   k:=public.visits_resolve_kit(p_data);
   if k->>'id' is distinct from coalesce(t.final_kit->>'id',t.interest_kit->>'id') and length(body)=0 then raise exception 'VISITS_KIT_REASON'; end if;
   update public.visit_cases set final_kit=k where id=t.id;
 elsif p_command='appointment' then
   if p_data->>'mode' not in ('onsite','video') or p_data->>'status' not in ('proposed','confirmed','cancelled') or nullif(p_data->>'date','')::date is null or nullif(p_data->>'start_time','')::time is null or nullif(p_data->>'end_time','')::time is null or (p_data->>'end_time')::time<=(p_data->>'start_time')::time then raise exception 'VISITS_INVALID'; end if;
   if p_data->>'status'='confirmed' and (t.installer_id is null or coalesce((p_data->>'client_confirmed')::boolean,false) is not true or coalesce((p_data->>'installer_confirmed')::boolean,false) is not true or (p_data->>'mode'='onsite' and length(trim(t.address))=0)) then raise exception 'VISITS_CONFIRM_REQUIRED'; end if;
   if t.installer_id is not null then perform pg_advisory_xact_lock(hashtextextended(t.installer_id::text||(p_data->>'date'),148)); end if;
   if p_data->>'status'='confirmed' and exists(select 1 from public.visit_slots where installer_id=t.installer_id and date=(p_data->>'date')::date and not cancelled and kind<>'available' and start_time<(p_data->>'end_time')::time and end_time>(p_data->>'start_time')::time) then raise exception 'VISITS_SCHEDULE_CONFLICT'; end if;
   if p_data->>'status'='confirmed' and exists(select 1 from public.visit_appointments a join public.visit_cases c on c.id=a.case_id where c.installer_id=t.installer_id and a.date=(p_data->>'date')::date and a.status='confirmed' and a.start_time<(p_data->>'end_time')::time and a.end_time>(p_data->>'start_time')::time and a.id is distinct from nullif(p_data->>'appointment_id','')::uuid) then raise exception 'VISITS_SCHEDULE_CONFLICT'; end if;
   a:=nullif(p_data->>'appointment_id','')::uuid;
   if a is not null then
     select * into ap from public.visit_appointments where id=a and case_id=t.id;
     if not found or ap.status in ('completed','missed','cancelled') then raise exception 'VISITS_INVALID'; end if;
     if length(body)=0 then raise exception 'VISITS_REQUIRED'; end if;
     update public.visit_appointments set mode=p_data->>'mode',date=(p_data->>'date')::date,start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,status=p_data->>'status',client_confirmed=coalesce((p_data->>'client_confirmed')::boolean,false),installer_confirmed=coalesce((p_data->>'installer_confirmed')::boolean,false),note=body where id=a;
   else
     if p_data->>'status'='cancelled' then raise exception 'VISITS_INVALID'; end if;
     insert into public.visit_appointments(case_id,mode,date,start_time,end_time,status,client_confirmed,installer_confirmed,note) values(t.id,p_data->>'mode',(p_data->>'date')::date,(p_data->>'start_time')::time,(p_data->>'end_time')::time,p_data->>'status',coalesce((p_data->>'client_confirmed')::boolean,false),coalesce((p_data->>'installer_confirmed')::boolean,false),body) returning id into a;
   end if;
   p_data:=p_data||jsonb_build_object('appointment_id',a,'previous',to_jsonb(ap));
 elsif p_command='visit_result' then
   if p_data->>'status' not in ('completed','missed') or length(body)=0 or length(coalesce(p_data->>'technical',''))>6000 then raise exception 'VISITS_REQUIRED'; end if;
   select * into ap from public.visit_appointments where id=(p_data->>'appointment_id')::uuid and case_id=t.id;
   if not found or ap.status in ('completed','missed','cancelled') then raise exception 'VISITS_INVALID'; end if;
   if p_data->>'status'='completed' then
     if nullif(p_data->>'performed_at','')::timestamptz is null or (p_data->>'performed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'VISITS_INVALID'; end if;
     if t.outcome='pending' then
       person:=nullif(p_data->>'next_owner_id','')::uuid;
       if length(trim(coalesce(p_data->>'next_action','')))=0 or nullif(p_data->>'next_at','')::timestamptz is null or person is null or (person is distinct from t.seller_id and person is distinct from t.installer_id) then raise exception 'VISITS_FOLLOWUP_REQUIRED'; end if;
       update public.visit_cases set outcome_reason='quote',outcome_note=body,next_action=p_data->>'next_action',next_at=(p_data->>'next_at')::timestamptz,next_owner_id=(p_data->>'next_owner_id')::uuid where id=t.id;
     end if;
     update public.visit_cases set visit_count=visit_count+1,last_visit_at=greatest(last_visit_at,(p_data->>'performed_at')::timestamptz) where id=t.id;
   end if;
   update public.visit_appointments set status=p_data->>'status',result=body,technical=coalesce(p_data->>'technical',''),performed_at=case when p_data->>'status'='completed' then (p_data->>'performed_at')::timestamptz else null end where id=ap.id;
 elsif p_command='quote' then
   k:=public.visits_resolve_kit(p_data);
   if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 30 or p_data->>'status' not in ('draft','sent') or length(trim(coalesce(p_data->>'conditions','')))=0 or nullif(p_data->>'valid_until','')::date is null then raise exception 'VISITS_INVALID'; end if;
   for line in select value from jsonb_array_elements(p_data->'lines') loop
     if length(trim(coalesce(line->>'description',''))) not between 1 and 300 or jsonb_typeof(line->'quantity') is distinct from 'number' or jsonb_typeof(line->'unit_price') is distinct from 'number' then raise exception 'VISITS_INVALID'; end if;
     if (line->>'quantity')::numeric not between 0.01 and 10000 or (line->>'quantity')::numeric<>round((line->>'quantity')::numeric,2) or (line->>'unit_price')::numeric not between 0 and 100000000 or (line->>'unit_price')::numeric<>round((line->>'unit_price')::numeric,2) then raise exception 'VISITS_INVALID'; end if;
     total:=total+round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2);
   end loop;
   if total>100000000 or (p_data->>'valid_until')::date<(now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'VISITS_INVALID'; end if;
   if p_data->>'status'='sent' and nullif(p_data->>'communicated_at','')::timestamptz is null then raise exception 'VISITS_REQUIRED'; end if;
   select coalesce(max(number),0)+1 into n from public.visit_quotes where case_id=t.id;
   update public.visit_quotes set status='replaced' where id=t.quote_id;
   insert into public.visit_quotes(case_id,number,kit,lines,total,conditions,exclusions,valid_until,status,communicated_at,created_by) values(t.id,n,k,p_data->'lines',total,p_data->>'conditions',coalesce(p_data->>'exclusions',''),(p_data->>'valid_until')::date,p_data->>'status',case when p_data->>'status'='sent' then (p_data->>'communicated_at')::timestamptz end,actor) returning * into q;
   update public.visit_cases set quote_id=q.id,quote_amount=q.total,quote_status=q.status where id=t.id;
   p_data:=p_data||jsonb_build_object('quote_id',q.id,'number',n,'total',total); body:='Presupuesto versión '||n;
 elsif p_command='quote_status' then
   select * into q from public.visit_quotes where id=(p_data->>'quote_id')::uuid and case_id=t.id and id=t.quote_id;
   if not found or p_data->>'status' not in ('sent','accepted','rejected') or length(body)=0 then raise exception 'VISITS_INVALID'; end if;
   if p_data->>'status' in ('accepted','rejected') and not commercial then raise exception 'VISITS_FORBIDDEN'; end if;
   if q.status not in ('draft','sent') or (p_data->>'status'='accepted' and (q.valid_until<(now() at time zone 'America/Argentina/Buenos_Aires')::date or q.status<>'sent')) then raise exception 'VISITS_INVALID'; end if;
   update public.visit_quotes set status=p_data->>'status',communicated_at=coalesce(communicated_at,now()) where id=q.id;
   update public.visit_cases set quote_status=p_data->>'status' where id=t.id;
 elsif p_command='outcome' then
   if length(body)=0 or p_data->>'outcome' not in ('pending','won','lost') then raise exception 'VISITS_REQUIRED'; end if;
   if p_data->>'outcome'='won' then
     k:=public.visits_resolve_kit(p_data);
     if nullif(p_data->>'at','')::timestamptz is null or (p_data->>'at')::timestamptz>now()+interval '5 minutes' then raise exception 'VISITS_INVALID'; end if;
     if t.quote_id is not null then
       select * into q from public.visit_quotes where id=t.quote_id;
       if q.status not in ('sent','accepted') or q.kit->>'id' is distinct from k->>'id' or q.valid_until<(now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'VISITS_QUOTE_REVIEW'; end if;
       update public.visit_quotes set status='accepted' where id=q.id;
     end if;
   elsif p_data->>'outcome'='lost' then
     if coalesce(p_data->>'reason','') not in ('price','payment','competitor','self_install','technical','postponed','no_response','other') then raise exception 'VISITS_LOSS_REQUIRED'; end if;
   else
     if coalesce(p_data->>'reason','') not in ('contact','quote','response','evaluating','financing','construction','other') or length(trim(coalesce(p_data->>'next_action','')))=0 or nullif(p_data->>'next_at','')::timestamptz is null then raise exception 'VISITS_FOLLOWUP_REQUIRED'; end if;
     person:=nullif(p_data->>'next_owner_id','')::uuid;
     if person is null or (person is distinct from t.seller_id and person is distinct from t.installer_id) then raise exception 'VISITS_PERSON_INVALID'; end if;
   end if;
   update public.visit_cases set outcome=p_data->>'outcome',outcome_reason=case when p_data->>'outcome'='won' then '' else p_data->>'reason' end,outcome_note=body,outcome_at=case when p_data->>'outcome'='won' then (p_data->>'at')::timestamptz when p_data->>'outcome'='lost' then now() end,
   final_kit=case when p_data->>'outcome'='won' then k else final_kit end,quote_status=case when p_data->>'outcome'='won' and quote_id is not null then 'accepted' else quote_status end,
   next_action=case when p_data->>'outcome'='pending' then p_data->>'next_action' else '' end,next_at=case when p_data->>'outcome'='pending' then (p_data->>'next_at')::timestamptz end,next_owner_id=case when p_data->>'outcome'='pending' then person end where id=t.id;
 elsif p_command='payment' then
   if jsonb_typeof(p_data->'amount') is distinct from 'number' or (p_data->>'amount')::numeric not between 0 and 100000000 or (p_data->>'amount')::numeric<>round((p_data->>'amount')::numeric,2) or length(body)=0 or length(trim(coalesce(p_data->>'method','')))=0 or length(trim(coalesce(p_data->>'receiver','')))=0 or nullif(p_data->>'at','')::timestamptz is null then raise exception 'VISITS_REQUIRED'; end if;
   update public.visit_cases set payment_amount=payment_amount+(p_data->>'amount')::numeric where id=t.id;
 elsif p_command='order_link' then
   -- Respect the caller's existing order ACL even though this function is a definer.
   person:=nullif(p_data->>'order_id','')::uuid;
   if not exists(select 1 from public.orders o where o.id=person and (o.seller_id=actor or 'admin'=any(public.visits_roles()))) then raise exception 'VISITS_ORDER_FORBIDDEN'; end if;
   select coalesce(nullif(to_jsonb(o)->>'order_code',''),nullif(to_jsonb(o)->>'display_code',''),o.id::text) into ref from public.orders o where o.id=person;
   insert into public.visit_order_links(case_id,order_id,reference) values(t.id,person,ref) on conflict do nothing;
   p_data:=p_data||jsonb_build_object('reference',ref); body:='Pedido vinculado: '||ref;
 elsif p_command='order_unlink' then
   if length(body)=0 then raise exception 'VISITS_REQUIRED'; end if;
   delete from public.visit_order_links where case_id=t.id and order_id=(p_data->>'order_id')::uuid;
 elsif p_command='attachment' then
   if length(coalesce(p_data->>'name','')) not between 1 and 250 or not exists(select 1 from storage.objects o where o.bucket_id='visit-attachments' and o.name=p_data->>'path' and o.name like t.id::text||'/'||auth.uid()::text||'/%' and (o.metadata->>'size')::bigint between 1 and 10485760 and o.metadata->>'mimetype' in ('image/png','image/jpeg','image/webp','application/pdf')) then raise exception 'VISITS_INVALID'; end if;
   insert into public.visit_attachments(case_id,path,name,mime,bytes,created_by)
   select t.id,o.name,p_data->>'name',o.metadata->>'mimetype',(o.metadata->>'size')::integer,actor from storage.objects o where o.bucket_id='visit-attachments' and o.name=p_data->>'path';
   body:=p_data->>'name';
 elsif p_command='note' then
   if length(body)=0 then raise exception 'VISITS_REQUIRED'; end if;
 else raise exception 'VISITS_INVALID'; end if;
 if p_command<>'create' then update public.visit_cases set version=version+1,updated_at=clock_timestamp() where id=t.id; end if;
 select * into t from public.visit_cases where id=p_case;
 insert into public.visit_events(case_id,actor_id,kind,body,data,created_at) values(t.id,actor,p_command,body,jsonb_build_object('input',p_data,'before',before_data,'after',to_jsonb(t)),clock_timestamp()) returning id into ev;
 insert into public.visit_notifications(case_id,event_id,recipient_id)
 select t.id,ev,s.id from public.sellers s where s.is_active is true and s.id in (t.seller_id,t.installer_id) and s.id<>actor on conflict do nothing;
 result:=jsonb_build_object('id',t.id,'version',t.version);
 insert into public.visit_operations(actor_id,key,case_id,request,result) values(actor,p_key,t.id,request,result);
 return result;
end $$;
notify pgrst,'reload schema';
