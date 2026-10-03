begin;
create table if not exists public.financial_people(
 id uuid primary key default gen_random_uuid(),seed_key text unique,full_name text not null check(length(trim(full_name)) between 2 and 160),
 kinds text[] not null check(cardinality(kinds)>0 and kinds <@ array['employee','temporary','carrier','professional','cleaning','transport','beneficiary']::text[]),
 cuit text check(cuit is null or cuit ~ '^\d{11}$'),role text,base_salary numeric(15,2) not null default 0 check(base_salary>=0),is_active boolean not null default true,
 employee_id uuid unique references public.employees(id),last_used_at timestamptz,version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists financial_people_unique_cuit on public.financial_people(cuit) where cuit is not null;
create table if not exists public.financial_people_aliases(
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.financial_people(id),
 alias text not null,source text not null,source_key text not null,unique(source,source_key)
);
create table if not exists public.financial_people_concepts(
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.financial_people(id),
 concept_id uuid not null unique references public.financial_concepts(id)
);
create table if not exists public.financial_people_carriers(
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.financial_people(id),
 carrier_id uuid not null unique references public.carriers(id)
);
create table if not exists public.financial_people_events(
 id uuid primary key default gen_random_uuid(),person_id uuid not null references public.financial_people(id),actor_id uuid references auth.users(id),
 before_value jsonb,after_value jsonb not null,reason text not null,created_at timestamptz not null default now()
);
create table if not exists public.financial_people_requests(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),request_key uuid not null,
 payload jsonb not null,result jsonb not null,unique(actor_id,request_key)
);
create or replace function public.financial_person_name_key(p_name text) returns text language sql immutable set search_path=public,pg_temp as $$
 select string_agg(word,' ' order by word) from regexp_split_to_table(upper(translate(p_name,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^A-Z0-9]+') word where word<>''
$$;
alter table public.financial_operations add column if not exists person_id uuid references public.financial_people(id);
do $$declare t text;begin foreach t in array array['financial_people','financial_people_aliases','financial_people_concepts','financial_people_carriers','financial_people_events','financial_people_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end$$;
create or replace function public.manage_financial_person(p_actor uuid,p_key uuid,p_id uuid,p_version integer,p_data jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.financial_people;v public.financial_people;req public.financial_people_requests;k text[];eid uuid;result jsonb;payload jsonb;
begin
 if not public.can_manage_financial_operations(p_actor) then raise exception 'No tenés permisos para administrar personal.' using errcode='42501';end if;
 if p_key is null then raise exception 'Solicitud inválida.';end if;
 payload:=jsonb_build_object('id',p_id,'version',p_version,'data',p_data,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
 select * into req from financial_people_requests where actor_id=p_actor and request_key=p_key;
 if found then if req.payload<>payload then raise exception 'Clave reutilizada con otros datos.' using errcode='23505';end if;return req.result;end if;
 k:=array(select value from jsonb_array_elements_text(p_data->'kinds') with ordinality group by value order by min(ordinality));
 if length(trim(coalesce(p_data->>'full_name','')))<2 or length(p_data->>'full_name')>160 or cardinality(k)=0 or not k <@ array['employee','temporary','carrier','professional','cleaning','transport','beneficiary']::text[] then raise exception 'Nombre o relación inválidos.';end if;
 if nullif(p_data->>'cuit','') is not null and (p_data->>'cuit') !~ '^\d{11}$' then raise exception 'CUIT: indicá los 11 dígitos.';end if;
 if length(coalesce(p_data->>'role',''))>160 or coalesce((p_data->>'base_salary')::numeric,0)<0 or coalesce((p_data->>'base_salary')::numeric,0)>=1e12 or (p_data->>'base_salary')::text in ('NaN','Infinity','-Infinity') then raise exception 'Datos de personal inválidos.';end if;
 if jsonb_typeof(p_data->'is_active') is distinct from 'boolean' then raise exception 'Indicá la disponibilidad.';end if;
 perform pg_advisory_xact_lock(hashtextextended('financial_people_names',0));
 if exists(select 1 from financial_people where financial_person_name_key(full_name)=financial_person_name_key(p_data->>'full_name') and id is distinct from p_id) or exists(select 1 from financial_people_aliases where financial_person_name_key(alias)=financial_person_name_key(p_data->>'full_name') and person_id is distinct from p_id) then raise exception 'Ya existe ese nombre o variante; editá su registro.' using errcode='23505';end if;
 if p_id is not null then
 select * into strict old from financial_people where id=p_id for update;
 if old.version is distinct from p_version then raise exception 'El registro cambió. Actualizá la lista.' using errcode='40001';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indicá un motivo para modificar el registro.';end if;
 eid:=old.employee_id;
 end if;
 if k && array['employee','temporary']::text[] and eid is null then
 insert into employees(full_name,cuit,role,base_salary,is_active) values(trim(p_data->>'full_name'),nullif(p_data->>'cuit',''),nullif(p_data->>'role',''),coalesce((p_data->>'base_salary')::numeric,0),(p_data->>'is_active')::boolean) returning id into eid;
 elsif eid is not null then
 update employees set full_name=trim(p_data->>'full_name'),cuit=nullif(p_data->>'cuit',''),role=nullif(p_data->>'role',''),base_salary=coalesce((p_data->>'base_salary')::numeric,0),is_active=(p_data->>'is_active')::boolean and k && array['employee','temporary']::text[] where id=eid;
 end if;
 if p_id is null then
 insert into financial_people(full_name,kinds,cuit,role,base_salary,is_active,employee_id) values(trim(p_data->>'full_name'),k,nullif(p_data->>'cuit',''),nullif(p_data->>'role',''),coalesce((p_data->>'base_salary')::numeric,0),(p_data->>'is_active')::boolean,eid) returning * into v;
 else
 update financial_people set full_name=trim(p_data->>'full_name'),kinds=k,cuit=nullif(p_data->>'cuit',''),role=nullif(p_data->>'role',''),base_salary=coalesce((p_data->>'base_salary')::numeric,0),is_active=(p_data->>'is_active')::boolean,employee_id=eid,version=version+1,updated_at=now() where id=p_id returning * into v;
 end if;
 insert into financial_people_events(person_id,actor_id,before_value,after_value,reason) values(v.id,p_actor,case when old.id is not null then to_jsonb(old) else null end,to_jsonb(v),coalesce(nullif(trim(p_reason),''),'Alta manual'));
 result:=to_jsonb(v);insert into financial_people_requests(actor_id,request_key,payload,result) values(p_actor,p_key,payload,result);return result;
end$$;
revoke all on function public.manage_financial_person(uuid,uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.manage_financial_person(uuid,uuid,uuid,integer,jsonb,text) to service_role;
create or replace function public.link_financial_operation_person() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.financial_people;payload jsonb;
begin
 if new.action not in ('save','link') then return new;end if;
 payload:=new.after_value->'payload';
 if nullif(payload->>'person_id','') is null then
  if payload->>'operation_type'='payroll_payment' then
   select * into p from financial_people where employee_id=nullif(payload->>'employee_id','')::uuid for update;
   if not found then raise exception 'Seleccioná personal registrado y habilitado.';end if;
  else update financial_operations set person_id=null where id=new.operation_id;return new;end if;
 else select * into strict p from financial_people where id=(payload->>'person_id')::uuid for update;end if;
 if not p.is_active then raise exception 'La persona está deshabilitada. Habilitala antes de cargar.';end if;
 if payload->>'operation_type' not in ('payroll_payment','operating_expense') then raise exception 'Persona incompatible con el circuito.';end if;
 if payload->>'operation_type'='payroll_payment' and (p.employee_id is null or p.employee_id is distinct from nullif(payload->>'employee_id','')::uuid or not p.kinds && array['employee','temporary']::text[]) then raise exception 'Elegí un empleado o eventual habilitado.';end if;
 update financial_operations set person_id=p.id where id=new.operation_id;
 update financial_people set last_used_at=greatest(last_used_at,(payload->>'effective_date')::date::timestamptz) where id=p.id;
 return new;
end$$;
drop trigger if exists financial_operation_person on public.financial_operation_events;
create trigger financial_operation_person after insert on public.financial_operation_events for each row execute function public.link_financial_operation_person();
notify pgrst,'reload schema';
commit;
