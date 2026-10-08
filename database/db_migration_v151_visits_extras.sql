-- Internal service: price must be specified in the quote, hidden from the general active catalogue.
insert into public.products(name,sku,category,price,is_active,fixed_price,settings) select 'Terminación Instalación Biofort','Terminación Instalación Biofort','Otros',0,false,false,jsonb_build_object('visits_only',true,'price_required',true) where not exists(select 1 from public.products where lower(trim(name))=lower('Terminación Instalación Biofort'));
alter table public.visit_cases add column if not exists extras_products jsonb not null default '[]' check(jsonb_typeof(extras_products)='array' and jsonb_array_length(extras_products)<=2);
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 if position('-- v151 structured extras' in definition)=0 then
 definition:=replace(definition,' elsif p_command=''extras'' then',$patch$
 elsif p_command='extras' then
 -- v151 structured extras
 if p_data ? 'extras_products' then
   if jsonb_typeof(p_data->'extras_products') is distinct from 'array' or jsonb_array_length(p_data->'extras_products')>2 then raise exception 'VISITS_INVALID'; end if;
   k:='[]'::jsonb;
   for line in select value from jsonb_array_elements(p_data->'extras_products') loop
     if coalesce(line->>'code','') not in ('additional','termination') or jsonb_typeof(line->'quantity') is distinct from 'number' or (line->>'quantity')::numeric not between 0.01 and 10000 or (line->>'quantity')::numeric<>round((line->>'quantity')::numeric,2) or (line->>'code'='termination' and (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric)) or exists(select 1 from jsonb_array_elements(k) x where x->>'code'=line->>'code') then raise exception 'VISITS_INVALID'; end if;
     select jsonb_build_object('product_id',id,'unit_price',price) into result from public.products where name=case when line->>'code'='additional' then 'Adicionales Instalación Biofort' else 'Terminación Instalación Biofort' end limit 1;
     k:=k||jsonb_build_array(jsonb_build_object('code',line->>'code','name',case when line->>'code'='additional' then 'Adicionales Instalación Biofort' else 'Terminación Instalación Biofort' end,'quantity',(line->>'quantity')::numeric,'unit',case when line->>'code'='additional' then 'metro' else 'unidad' end)||coalesce(result,jsonb_build_object('product_id',null,'unit_price',null)));
   end loop;
   update public.visit_cases set extras_products=k where id=t.id;
   p_data:=p_data||jsonb_build_object('extras_products',k);
 end if;
$patch$);
 if position('-- v151 structured extras' in definition)=0 then raise exception 'Unexpected visits command definition'; end if;
 execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
-- Also repair an already-installed definition: missing codes must be rejected.
do $$ declare definition text; begin
 select pg_get_functiondef('public.visits_command(text,uuid,uuid,integer,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'if line->>''code'' not in','if coalesce(line->>''code'','''') not in');
 execute definition;
end $$;
