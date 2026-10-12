begin;
alter table public.financial_classification_items add column if not exists detail text not null default '' check(length(detail)<=160);
do $$begin if to_regprocedure('public.manage_financial_classification_before_v198(uuid,uuid,uuid,integer,jsonb)') is null then alter function public.manage_financial_classification(uuid,uuid,uuid,integer,jsonb) rename to manage_financial_classification_before_v198;end if;end $$;
create or replace function public.manage_financial_classification(p_actor uuid,p_key uuid,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;item financial_classification_items;detail_value text;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('classification:'||p_key::text,0));
 select after_value into result from financial_classification_events where request_key=p_key and actor_id=p_actor;if found then return result;end if;
 if p_data ? 'detail' and jsonb_typeof(p_data->'detail')<>'string' then raise exception 'Detalle inválido';end if;
 detail_value:=trim(coalesce(p_data->>'detail',''));if length(detail_value)>160 then raise exception 'Detalle demasiado largo';end if;
 result:=manage_financial_classification_before_v198(p_actor,p_key,p_id,p_version,p_data);
 update financial_classification_items set detail=case when kind='preset' then detail_value else '' end where id=(result->>'id')::uuid returning * into item;
 update financial_classification_events set after_value=to_jsonb(item) where request_key=p_key and actor_id=p_actor;
 return to_jsonb(item);
end $$;
revoke all on function manage_financial_classification(uuid,uuid,uuid,integer,jsonb),manage_financial_classification_before_v198(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function manage_financial_classification(uuid,uuid,uuid,integer,jsonb) to service_role;
do $$declare definition text;begin definition:=pg_get_functiondef('public.apply_catalog_classification(uuid,uuid,uuid)'::regprocedure);definition:=replace(definition,$old$'destination',coalesce(dest.name,''),'label',p.name$old$,$new$'destination',coalesce(dest.name,''),'detail',p.detail,'label',p.name$new$);execute definition;end $$;
notify pgrst,'reload schema';
commit;
