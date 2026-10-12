begin;
create table if not exists public.financial_classification_items(
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('category','concept','person','destination','preset')),name text not null check(length(trim(name)) between 1 and 160),
 category_id uuid references financial_classification_items(id),concept_id uuid references financial_classification_items(id),person_id uuid references financial_classification_items(id),destination_id uuid references financial_classification_items(id),
 legacy_concept_id uuid unique references financial_concepts(id),movement_type text not null default 'Egreso' check(movement_type in ('Ingreso','Egreso','Mov. Financiero')),efe_category text not null default '',is_active boolean not null default true,version integer not null default 1,origin text not null default 'manual',updated_at timestamptz not null default now());
create unique index if not exists classification_unique_name on financial_classification_items(kind,lower(trim(name)),coalesce(category_id,'00000000-0000-0000-0000-000000000000'::uuid)) where kind<>'preset';
create table if not exists public.financial_classification_events(id bigint generated always as identity primary key,item_id uuid not null references financial_classification_items(id),request_key uuid not null unique,actor_id uuid not null references auth.users(id),before_value jsonb,after_value jsonb not null,created_at timestamptz not null default now());
alter table financial_classification_items enable row level security;alter table financial_classification_events enable row level security;
revoke all on financial_classification_items,financial_classification_events from public,anon,authenticated;
grant all on financial_classification_items,financial_classification_events to service_role;grant usage,select on sequence financial_classification_events_id_seq to service_role;
create or replace function public.manage_financial_classification(p_actor uuid,p_key uuid,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous financial_classification_items;current_row financial_classification_items;c financial_classification_items;cat financial_classification_items;legacy uuid;ref uuid;k text;label text;item_id uuid:=coalesce(p_id,gen_random_uuid());
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('classification:'||p_key::text,0));
 if exists(select 1 from financial_classification_events where request_key=p_key) then return (select after_value from financial_classification_events where request_key=p_key);end if;
 k:=p_data->>'kind';label:=trim(p_data->>'name');if k not in ('category','concept','person','destination','preset') or coalesce(length(label),0) not between 1 and 160 or jsonb_typeof(p_data->'is_active') is distinct from 'boolean' then raise exception 'Nombre o estado inválido';end if;
 if p_id is not null then select * into strict previous from financial_classification_items where id=p_id for update;if previous.version<>p_version then raise exception 'La opción cambió. Actualizá la pantalla.' using errcode='40001';end if;if previous.kind<>k then raise exception 'No se puede cambiar el tipo de registro';end if;end if;
 if k='concept' then select * into strict cat from financial_classification_items where id=(p_data->>'category_id')::uuid and kind='category';end if;
 if k='preset' then
 select * into strict c from financial_classification_items where id=(p_data->>'concept_id')::uuid and kind='concept';select * into strict cat from financial_classification_items where id=c.category_id and kind='category';
 foreach label in array array['person_id','destination_id'] loop ref:=nullif(p_data->>label,'')::uuid;if ref is not null and not exists(select 1 from financial_classification_items where id=ref and kind=case when label='person_id' then 'person' else 'destination' end) then raise exception 'Persona o destino inválido';end if;end loop;
 label:=trim(p_data->>'name');legacy:=previous.legacy_concept_id;
 if legacy is null then
 insert into financial_concepts(concept,category,sub_category,movement_type,efe_category,is_active) values(label,cat.name,coalesce((select name from financial_classification_items where id=nullif(p_data->>'destination_id','')::uuid),''),coalesce(p_data->>'movement_type','Egreso'),coalesce(p_data->>'efe_category',''),true) returning id into legacy;
 insert into financial_concept_operation_types(financial_concept_id,operation_type) values(legacy,case when cat.name in ('Impuestos','IIGG') then 'tax_payment' when cat.name in ('Proveedores','Proveedores (Deuda)') then 'supplier_payment' when cat.name='Recaudación' then 'customer_collection' when cat.name='Sueldos' then 'payroll_payment' when cat.name='Movimiento de cuentas' then 'internal_transfer' else 'operating_expense' end) on conflict do nothing;
 end if;
 end if;
 insert into financial_classification_items(id,kind,name,category_id,concept_id,person_id,destination_id,legacy_concept_id,movement_type,efe_category,is_active,version,origin)
 values(item_id,k,label,case when k='concept' then cat.id end,case when k='preset' then c.id end,case when k='preset' then nullif(p_data->>'person_id','')::uuid end,case when k='preset' then nullif(p_data->>'destination_id','')::uuid end,legacy,coalesce(p_data->>'movement_type','Egreso'),coalesce(p_data->>'efe_category',''),(p_data->>'is_active')::boolean,coalesce(previous.version,0)+1,coalesce(previous.origin,'manual'))
 on conflict(id) do update set name=excluded.name,category_id=excluded.category_id,concept_id=excluded.concept_id,person_id=excluded.person_id,destination_id=excluded.destination_id,movement_type=excluded.movement_type,efe_category=excluded.efe_category,is_active=excluded.is_active,version=excluded.version,updated_at=now() returning * into current_row;
 insert into financial_classification_events(item_id,request_key,actor_id,before_value,after_value) values(item_id,p_key,p_actor,case when p_id is not null then to_jsonb(previous) end,to_jsonb(current_row));return to_jsonb(current_row);
end $$;
revoke all on function manage_financial_classification(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;grant execute on function manage_financial_classification(uuid,uuid,uuid,integer,jsonb) to service_role;
create table if not exists public.financial_classification_snapshots(transaction_id uuid primary key references cash_transactions(id),preset_id uuid not null references financial_classification_items(id),value jsonb not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table financial_classification_snapshots enable row level security;revoke all on financial_classification_snapshots from public,anon,authenticated;grant all on financial_classification_snapshots to service_role;
create or replace function public.apply_catalog_classification(p_actor uuid,p_transaction uuid,p_concept uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p financial_classification_items;c financial_classification_items;cat financial_classification_items;person financial_classification_items;dest financial_classification_items;t cash_transactions;value jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into p from financial_classification_items where legacy_concept_id=p_concept and kind='preset';if not found then return;end if;
 select * into strict c from financial_classification_items where id=p.concept_id and kind='concept';select * into strict cat from financial_classification_items where id=c.category_id and kind='category';
 if p.person_id is not null then select * into strict person from financial_classification_items where id=p.person_id and kind='person';end if;if p.destination_id is not null then select * into strict dest from financial_classification_items where id=p.destination_id and kind='destination';end if;
 if not p.is_active or not c.is_active or not cat.is_active or p.origin='historical_client' or person.is_active=false or dest.is_active=false then raise exception 'Esta opción está deshabilitada para nuevas cargas';end if;
 select * into strict t from cash_transactions where id=p_transaction for update;if t.financial_concept_id is distinct from p_concept then raise exception 'La clasificación del movimiento cambió';end if;
 if p.movement_type='Ingreso' and t.type<>'ingreso' or p.movement_type='Egreso' and t.type<>'egreso' then raise exception 'El tipo de la opción no corresponde al movimiento';end if;
 value:=jsonb_build_object('category',cat.name,'concept',c.name,'person',coalesce(person.name,''),'destination',coalesce(dest.name,''),'label',p.name);
 perform set_config('zono.financial_write','on',true);update cash_transactions set concept=c.name,category=cat.name,sub_category=nullif(dest.name,''),efe_category=nullif(p.efe_category,'') where id=t.id;perform set_config('zono.financial_write','off',true);
 insert into financial_classification_snapshots(transaction_id,preset_id,value,actor_id) values(t.id,p.id,value,p_actor) on conflict(transaction_id) do update set preset_id=excluded.preset_id,value=excluded.value,actor_id=excluded.actor_id,created_at=now();
 insert into financial_movement_classification_events(transaction_id,before_value,after_value,actor_id) values(t.id,jsonb_build_object('label',t.concept,'category',t.category),value,p_actor);
end $$;
create or replace function public.classify_catalog_financial_movement(p_actor uuid,p_transaction uuid,p_concept uuid,p_version integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform classify_existing_financial_movement(p_actor,p_transaction,p_concept,p_version);perform apply_catalog_classification(p_actor,p_transaction,p_concept);end $$;
create or replace function public.save_catalog_financial_operation(p_actor uuid,p_key uuid,p_action text,p_payload jsonb,p_target jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;tx text;existed boolean;legacy financial_concepts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_key::text,0));
 select exists(select 1 from financial_operation_requests where actor_id=p_actor and request_key=p_key) into existed;
 if p_action='save' and nullif(p_payload->>'financial_concept_id','') is not null then select * into strict legacy from financial_concepts where id=(p_payload->>'financial_concept_id')::uuid and is_active;p_payload:=p_payload||jsonb_build_object('category',legacy.category,'sub_category',legacy.sub_category,'efe_category',legacy.efe_category);end if;
 result:=save_financial_operation(p_actor,p_key,p_action,p_payload,p_target,p_reason);if p_action='save' and not existed and nullif(p_payload->>'financial_concept_id','') is not null then for tx in select jsonb_array_elements_text(result->'transaction_ids') loop perform apply_catalog_classification(p_actor,tx::uuid,(p_payload->>'financial_concept_id')::uuid);end loop;end if;return result;end $$;
revoke all on function apply_catalog_classification(uuid,uuid,uuid),classify_catalog_financial_movement(uuid,uuid,uuid,integer),save_catalog_financial_operation(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function classify_catalog_financial_movement(uuid,uuid,uuid,integer),save_catalog_financial_operation(uuid,uuid,text,jsonb,jsonb,text) to service_role;

notify pgrst,'reload schema';
commit;
