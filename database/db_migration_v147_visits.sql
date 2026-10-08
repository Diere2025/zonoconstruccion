-- Seguimiento comercial paralelo a Pedidos. Ejecutar dentro de una transacción.
create or replace function public.visits_profile() returns uuid language sql stable security definer set search_path='' as $$
 select s.id from public.sellers s join auth.users u on u.id=auth.uid()
 where s.is_active is true and (s.id=u.id or (not exists(select 1 from public.sellers x where x.id=u.id)
   and u.email_confirmed_at is not null and lower(trim(s.email))=lower(trim(u.email))
   and (select count(*) from public.sellers x where lower(trim(x.email))=lower(trim(u.email)))=1
   and (select count(*) from auth.users x where lower(trim(x.email))=lower(trim(u.email)))=1)) limit 1;
$$;
create or replace function public.visits_roles() returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct lower(trim(r))),array[]::text[]) from public.sellers s,
 lateral unnest(coalesce(s.roles,array[]::text[])||array[s.role]) r where s.id=public.visits_profile();
$$;
create or replace function public.visits_commercial() returns boolean language sql stable security definer set search_path='' as $$
 select public.visits_roles() && array['seller','admin'];
$$;
create or replace function public.visits_active() returns boolean language sql stable security definer set search_path='' as $$
 select public.visits_profile() is not null and public.visits_roles() && array['seller','admin','instalador'];
$$;
create or replace function public.visits_limited_installer() returns boolean language sql stable security definer set search_path='' as $$
 -- Includes disabled installer accounts; an inactive account must not regain legacy access.
 select exists(select 1 from public.sellers s where (s.id=auth.uid() or (not exists(select 1 from public.sellers x where x.id=auth.uid())
 and lower(trim(s.email))=(select lower(trim(email)) from auth.users where id=auth.uid())))
 and (coalesce(s.roles,array[]::text[])||array[s.role]) @> array['instalador']
 and not (coalesce(s.roles,array[]::text[])||array[s.role]) && array['seller','admin','compras','administracion','fletero','logistica']);
$$;

create table if not exists public.visit_cases (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 version integer not null default 1, created_by uuid not null references public.sellers(id),
 customer_name text not null check(length(trim(customer_name)) between 1 and 500), phone text not null check(length(trim(phone)) between 1 and 500),
 locality text not null check(length(trim(locality)) between 1 and 500), address text not null default '', maps_url text not null default '',
 request_reason text not null check(length(trim(request_reason)) between 1 and 500), notes text not null default '',
 seller_id uuid not null references public.sellers(id), installer_id uuid references public.sellers(id),
 interest_kit jsonb not null check(jsonb_typeof(interest_kit)='object'), final_kit jsonb,
 outcome text not null default 'pending' check(outcome in ('pending','won','lost')), outcome_reason text not null default 'contact', outcome_note text not null default '', outcome_at timestamptz,
 next_action text not null default 'Contactar al cliente', next_at timestamptz, next_owner_id uuid references public.sellers(id),
 contact_status text not null default 'none' check(contact_status in ('none','attempted','contacted')),
 quote_amount numeric(15,2), quote_status text not null default '', quote_id uuid,
 last_visit_at timestamptz, visit_count integer not null default 0, payment_amount numeric(15,2) not null default 0 check(payment_amount>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(outcome<>'lost' or (outcome_reason in ('price','payment','competitor','self_install','technical','postponed','no_response','other') and length(trim(outcome_note))>0)),
 check(outcome<>'won' or (final_kit is not null and outcome_at is not null and length(trim(outcome_note))>0)),
 check(outcome<>'pending' or (outcome_reason in ('contact','quote','response','evaluating','financing','construction','other') and length(trim(next_action))>0 and next_at is not null and next_owner_id is not null))
);
create table if not exists public.visit_appointments (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.visit_cases(id),
 mode text not null check(mode in ('onsite','video')), date date not null, start_time time not null, end_time time not null check(end_time>start_time),
 status text not null check(status in ('proposed','confirmed','completed','missed','cancelled')),
 client_confirmed boolean not null default false, installer_confirmed boolean not null default false,
 note text not null default '', result text not null default '', technical text not null default '', performed_at timestamptz,
 check(status<>'confirmed' or (client_confirmed and installer_confirmed)),
 check(status not in ('completed','missed') or length(trim(result))>0),
 check(status<>'completed' or performed_at is not null)
);
create table if not exists public.visit_quotes (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.visit_cases(id), number integer not null,
 kit jsonb not null, lines jsonb not null check(jsonb_typeof(lines)='array'), total numeric(15,2) not null check(total>=0),
 conditions text not null, exclusions text not null default '', valid_until date not null,
 status text not null check(status in ('draft','sent','accepted','rejected','replaced')),
 communicated_at timestamptz, created_by uuid not null references public.sellers(id), created_at timestamptz not null default now(),
 unique(case_id,number)
);
create table if not exists public.visit_events (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.visit_cases(id), actor_id uuid not null references public.sellers(id),
 kind text not null, body text not null default '', data jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.visit_order_links (
 case_id uuid not null references public.visit_cases(id), order_id uuid not null references public.orders(id) on delete cascade, reference text not null,
 primary key(case_id,order_id)
);
create table if not exists public.visit_attachments (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.visit_cases(id), path text not null unique,
 name text not null, mime text not null, bytes integer not null check(bytes between 1 and 10485760),
 created_by uuid not null references public.sellers(id), created_at timestamptz not null default now()
);
create table if not exists public.visit_notifications (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.visit_cases(id), event_id uuid not null references public.visit_events(id),
 recipient_id uuid not null references public.sellers(id), read_at timestamptz, created_at timestamptz not null default now(), unique(event_id,recipient_id)
);
create table if not exists public.visit_operations (
 actor_id uuid not null references public.sellers(id), key uuid not null, case_id uuid not null references public.visit_cases(id),
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(actor_id,key)
);
create index if not exists visit_cases_updated on public.visit_cases(updated_at desc,id);
create index if not exists visit_cases_installer on public.visit_cases(installer_id,outcome,next_at);
create index if not exists visit_appointments_case on public.visit_appointments(case_id,date,start_time);
create index if not exists visit_events_case on public.visit_events(case_id,created_at,id);
create index if not exists visit_notifications_inbox on public.visit_notifications(recipient_id,created_at desc) where read_at is null;

create or replace function public.visits_can_read(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.visits_active() and exists(select 1 from public.visit_cases c where c.id=p_case
 and (public.visits_commercial() or c.installer_id=public.visits_profile()));
$$;
create or replace function public.visits_kit(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
 select jsonb_build_object('id',id,'name',name,'sku',sku,'price',price) into r from public.products
 where id=p_id and is_active is distinct from false and lower(name) like '%kit instalaci%' and lower(name) not like '%adicional%';
 if r is null then raise exception 'VISITS_KIT_REQUIRED'; end if; return r;
end $$;
create or replace function public.visits_people() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.full_name,'roles',coalesce(s.roles,array[]::text[])||array[s.role]) order by s.full_name),'[]')
 from public.sellers s where public.visits_active() and s.is_active is true
 and (coalesce(s.roles,array[]::text[])||array[s.role]) && array['seller','admin','instalador'];
$$;
create or replace function public.visits_session() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
 if not public.visits_active() then raise exception 'VISITS_FORBIDDEN'; end if;
 select jsonb_build_object('id',s.id,'name',s.full_name,'commercial',public.visits_commercial(),'administrator','admin'=any(public.visits_roles()),
 'people',public.visits_people(),'kits',coalesce((select jsonb_agg(public.visits_kit(p.id) order by p.name) from public.products p where p.is_active is distinct from false and lower(p.name) like '%kit instalaci%' and lower(p.name) not like '%adicional%'),'[]')) into r
 from public.sellers s where s.id=public.visits_profile(); return r;
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
 elsif p_command='edit' then
   update public.visit_cases set customer_name=trim(p_data->>'customer_name'),phone=trim(p_data->>'phone'),locality=trim(p_data->>'locality'),address=coalesce(p_data->>'address',''),maps_url=coalesce(p_data->>'maps_url',''),request_reason=trim(p_data->>'request_reason'),notes=coalesce(p_data->>'notes','') where id=t.id;
 elsif p_command='assign' then
   if nullif(p_data->>'installer_id','')::uuid is distinct from t.installer_id and exists(select 1 from public.visit_appointments where case_id=t.id and status='confirmed') then raise exception 'VISITS_REASSIGN_SCHEDULE'; end if;
   update public.visit_cases set seller_id=(p_data->>'seller_id')::uuid,installer_id=nullif(p_data->>'installer_id','')::uuid,
   next_owner_id=case when next_owner_id=installer_id then coalesce(nullif(p_data->>'installer_id','')::uuid,(p_data->>'seller_id')::uuid) when next_owner_id=seller_id then (p_data->>'seller_id')::uuid else next_owner_id end where id=t.id;
 elsif p_command='contact' then
   if p_data->>'result' not in ('attempted','contacted') or length(body)=0 or length(trim(coalesce(p_data->>'channel','')))=0 or length(trim(coalesce(p_data->>'interlocutor','')))=0 or nullif(p_data->>'at','')::timestamptz is null then raise exception 'VISITS_REQUIRED'; end if;
   update public.visit_cases set contact_status=case when contact_status='contacted' then 'contacted' else p_data->>'result' end where id=t.id;
 elsif p_command='kit' then
   k:=public.visits_kit(nullif(p_data->>'kit_id','')::uuid);
   if k->>'id' is distinct from coalesce(t.final_kit->>'id',t.interest_kit->>'id') and length(body)=0 then raise exception 'VISITS_KIT_REASON'; end if;
   update public.visit_cases set final_kit=k where id=t.id;
 elsif p_command='appointment' then
   if p_data->>'mode' not in ('onsite','video') or p_data->>'status' not in ('proposed','confirmed','cancelled') or nullif(p_data->>'date','')::date is null or nullif(p_data->>'start_time','')::time is null or nullif(p_data->>'end_time','')::time is null or (p_data->>'end_time')::time<=(p_data->>'start_time')::time then raise exception 'VISITS_INVALID'; end if;
   if p_data->>'status'='confirmed' and (t.installer_id is null or coalesce((p_data->>'client_confirmed')::boolean,false) is not true or coalesce((p_data->>'installer_confirmed')::boolean,false) is not true or (p_data->>'mode'='onsite' and length(trim(t.address))=0)) then raise exception 'VISITS_CONFIRM_REQUIRED'; end if;
   if t.installer_id is not null then perform pg_advisory_xact_lock(hashtextextended(t.installer_id::text||(p_data->>'date'),148)); end if;
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
   k:=public.visits_kit(nullif(p_data->>'kit_id','')::uuid);
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
     k:=public.visits_kit(nullif(p_data->>'kit_id','')::uuid);
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

create or replace function public.visits_read_notifications() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(r order by r->>'created_at' desc),'[]') from (
 select jsonb_build_object('id',n.id,'case_id',c.id,'number',c.number,'customer_name',c.customer_name,'kind',e.kind,'created_at',n.created_at) r
 from public.visit_notifications n join public.visit_cases c on c.id=n.case_id join public.visit_events e on e.id=n.event_id
 where public.visits_active() and n.recipient_id=public.visits_profile() and n.read_at is null and public.visits_can_read(c.id)
 order by n.created_at desc limit 30) x;
$$;
create or replace function public.visits_mark_read(p_case uuid) returns void language sql security definer set search_path='' as $$
 update public.visit_notifications set read_at=now() where case_id=p_case and recipient_id=public.visits_profile() and public.visits_can_read(p_case);
$$;

create or replace function public.visits_list(p_filter jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; actor uuid:=public.visits_profile(); commercial boolean:=public.visits_commercial(); begin
 if not public.visits_active() then raise exception 'VISITS_FORBIDDEN'; end if;
 if p_page<0 or p_page>100000 or length(coalesce(p_filter->>'search',''))>200 then raise exception 'VISITS_INVALID'; end if;
 with filtered as (
 select c.* from public.visit_cases c where (commercial or c.installer_id=actor)
 and (coalesce(p_filter->>'search','')='' or strpos(lower(c.customer_name||' '||c.phone||' '||c.locality||' '||c.address||' VIS-'||lpad(c.number::text,6,'0')),lower(p_filter->>'search'))>0)
 and (coalesce(p_filter->>'seller_id','')='' or c.seller_id=(p_filter->>'seller_id')::uuid)
 and (coalesce(p_filter->>'installer_id','')='' or c.installer_id=(p_filter->>'installer_id')::uuid)
 and (coalesce(p_filter->>'kit_id','')='' or coalesce(c.final_kit->>'id',c.interest_kit->>'id')=p_filter->>'kit_id')
 and (coalesce(p_filter->>'from','')='' or (c.last_visit_at at time zone 'America/Argentina/Buenos_Aires')::date>=(p_filter->>'from')::date)
 and (coalesce(p_filter->>'to','')='' or (c.last_visit_at at time zone 'America/Argentina/Buenos_Aires')::date<=(p_filter->>'to')::date)
 and (coalesce(p_filter->>'view','all')='all' or (p_filter->>'view'='visited' and c.visit_count>0)
 or p_filter->>'view'=c.outcome or (p_filter->>'view'='unassigned' and c.installer_id is null)
 or (p_filter->>'view'='uncontacted' and c.contact_status='none')
 or (p_filter->>'view'='overdue' and c.outcome='pending' and c.next_at<now())
 or (p_filter->>'view'='needs_quote' and c.visit_count>0 and c.quote_id is null))
 ), stats as (
 select count(*) total,coalesce(sum(visit_count),0) appointments,count(*) filter(where visit_count>0) opportunities,
 count(*) filter(where visit_count>0 and outcome='won') won,count(*) filter(where visit_count>0 and outcome='pending') pending,count(*) filter(where visit_count>0 and outcome='lost') lost from filtered
 ), reasons as (select outcome_reason,count(*) n from filtered where visit_count>0 and outcome='lost' group by outcome_reason),
 page as (select * from filtered order by updated_at desc,id limit 50 offset p_page*50)
 select jsonb_build_object('visits',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.id) from page p),'[]'),
 'total',s.total,'summary',jsonb_build_object('appointments',s.appointments,'opportunities',s.opportunities,'won',s.won,'pending',s.pending,'lost',s.lost,
 'conversion',case when s.opportunities=0 then 0 else round(s.won*100.0/s.opportunities) end,'reasons',coalesce((select jsonb_object_agg(outcome_reason,n) from reasons),'{}'))) into r from stats s;
 return r;
end $$;
revoke all on function public.visits_list(jsonb,integer) from public,anon;
grant execute on function public.visits_list(jsonb,integer) to authenticated;

-- Reads use RLS; writes only use the atomic, validated command above.
do $$ declare tbl text; begin
 foreach tbl in array array['visit_cases','visit_appointments','visit_quotes','visit_events','visit_order_links','visit_attachments','visit_notifications','visit_operations'] loop
   execute format('alter table public.%I enable row level security',tbl);
   execute format('revoke all on public.%I from anon,authenticated',tbl);
   if tbl<>'visit_operations' then
     execute format('grant select on public.%I to authenticated',tbl);
     execute format('drop policy if exists visits_read on public.%I',tbl);
     if tbl='visit_cases' then execute 'create policy visits_read on public.visit_cases for select to authenticated using((select public.visits_active()) and ((select public.visits_commercial()) or installer_id=(select public.visits_profile())))';
     elsif tbl='visit_notifications' then execute 'create policy visits_read on public.visit_notifications for select to authenticated using(recipient_id=public.visits_profile() and public.visits_can_read(case_id))';
     else execute format('create policy visits_read on public.%I for select to authenticated using(public.visits_can_read(case_id))',tbl); end if;
   end if;
 end loop;
end $$;
-- Restrictive guards affect only accounts explicitly granted the new installer-only role.
-- Existing roles and their permissive policies are left intact.
do $$ declare r record; begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relname not like 'visit\_%' escape '\' loop
   execute format('drop policy if exists visits_installer_guard on public.%I',r.relname);
   if r.relname='sellers' then execute 'create policy visits_installer_guard on public.sellers as restrictive for all to authenticated using(not (select public.visits_limited_installer()) or id=auth.uid() or id=(select public.visits_profile())) with check(not (select public.visits_limited_installer()))';
   else execute format('create policy visits_installer_guard on public.%I as restrictive for all to authenticated using(not (select public.visits_limited_installer())) with check(not (select public.visits_limited_installer()))',r.relname); end if;
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('visit-attachments','visit-attachments',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf']) on conflict(id) do nothing;
drop policy if exists visit_storage_guard on storage.objects;
create policy visit_storage_guard on storage.objects as restrictive for all to authenticated using(bucket_id<>'visit-attachments' and not (select public.visits_limited_installer())) with check(bucket_id<>'visit-attachments' and not (select public.visits_limited_installer()));
-- Internal helpers cannot be called as unrestricted public RPCs.
revoke all on function public.visits_kit(uuid),public.visits_people() from public,anon,authenticated;
revoke all on function public.visits_profile(),public.visits_roles(),public.visits_active(),public.visits_commercial(),public.visits_limited_installer(),public.visits_can_read(uuid),public.visits_session(),public.visits_command(text,uuid,uuid,integer,jsonb),public.visits_read_notifications(),public.visits_mark_read(uuid) from public,anon;
grant execute on function public.visits_profile(),public.visits_roles(),public.visits_active(),public.visits_commercial(),public.visits_limited_installer(),public.visits_can_read(uuid),public.visits_session(),public.visits_command(text,uuid,uuid,integer,jsonb),public.visits_read_notifications(),public.visits_mark_read(uuid) to authenticated;
notify pgrst,'reload schema';

-- Block installer-only calls to legacy SECURITY DEFINER RPCs as well as table reads.
-- This pre-request hook is the supported PostgREST mechanism. Preserve an existing hook.
create table if not exists public.visit_guard_config(id boolean primary key default true check(id), previous_hook text);
alter table public.visit_guard_config enable row level security;
revoke all on public.visit_guard_config from public,anon,authenticated;
do $$ declare previous text; scoped text; begin
 if not exists(select 1 from public.visit_guard_config) then
   select substring(setting from length('pgrst.db_pre_request=')+1) into previous from pg_roles r,lateral unnest(r.rolconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
   select substring(setting from length('pgrst.db_pre_request=')+1) into scoped from pg_db_role_setting s join pg_roles r on r.oid=s.setrole join pg_database d on d.oid=s.setdatabase,lateral unnest(s.setconfig) setting where r.rolname='authenticator' and d.datname=current_database() and setting like 'pgrst.db_pre_request=%';
   insert into public.visit_guard_config(previous_hook) values(nullif(coalesce(scoped,previous),''));
 end if;
end $$;
create or replace function public.visits_rest_guard() returns void language plpgsql security definer set search_path='' as $$
declare path text:=coalesce(current_setting('request.path',true),''); previous text; begin
 if public.visits_limited_installer() and path not in (
 '/rpc/visits_session','/rpc/visits_command','/rpc/visits_list','/rpc/visits_read_notifications','/rpc/visits_mark_read',
 '/rpc/visits_active','/rpc/visits_limited_installer','/visit_cases','/visit_appointments','/visit_quotes','/visit_events','/visit_order_links','/visit_attachments','/visit_notifications','/sellers'
 ) then raise insufficient_privilege using message='VISITS_FORBIDDEN'; end if;
 select previous_hook into previous from public.visit_guard_config where id;
 if previous is not null and previous<>'public.visits_rest_guard' then execute format('select %s()',previous::regproc); end if;
end $$;
revoke all on function public.visits_rest_guard() from public;
grant execute on function public.visits_rest_guard() to anon,authenticated,service_role;
do $$ begin execute format('alter role authenticator in database %I set pgrst.db_pre_request=%L',current_database(),'public.visits_rest_guard'); end $$;
notify pgrst,'reload config';
