begin;
alter table supplier_source_aliases add column version integer not null default 1;
create table public.supplier_alias_events (
 id uuid primary key default gen_random_uuid(),alias_id uuid not null references supplier_source_aliases(id),actor_id uuid not null references auth.users(id),
 request_id uuid not null,payload jsonb not null,before_value jsonb,after_value jsonb not null,created_at timestamptz not null default now(),unique(actor_id,request_id)
);
alter table supplier_alias_events enable row level security;
revoke all on supplier_alias_events from public,anon,authenticated;
grant select,insert on supplier_alias_events to service_role;
create function public.review_supplier_alias(p_actor uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior supplier_alias_events;item supplier_source_aliases;before_value jsonb;result jsonb;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso para revisar equivalencias.' using errcode='42501';end if;
 if p_request is null or length(trim(coalesce(p_payload->>'reason',''))) not between 3 and 2000
 or length(trim(coalesce(p_payload->>'sourceBook',''))) not between 10 and 120 or length(trim(coalesce(p_payload->>'sourceAlias',''))) not between 1 and 200
 or coalesce(p_payload->>'status','') not in ('proposed','verified','rejected') or coalesce(p_payload->>'condition','') not in ('facturado','por_remito','historico')
 or length(coalesce(p_payload->>'businessLabel',''))>100 or (p_payload->>'version')::integer is null or (p_payload->>'version')::integer<0 then raise exception 'Equivalencia inválida.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':alias-review:'||p_request::text,0));
 select * into prior from supplier_alias_events where actor_id=p_actor and request_id=p_request;
 if found then if prior.payload<>p_payload then raise exception 'Solicitud reutilizada con otros datos.' using errcode='23505';end if;return prior.after_value;end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-alias:'||(p_payload->>'sourceBook')||':'||(p_payload->>'sourceAlias'),0));
 perform 1 from suppliers where id=(p_payload->>'supplierId')::uuid;if not found then raise exception 'Proveedor inexistente.';end if;
 select * into item from supplier_source_aliases where source_book=p_payload->>'sourceBook' and source_alias=p_payload->>'sourceAlias' for update;
 if coalesce(item.version,0)<>(p_payload->>'version')::integer then raise exception 'La equivalencia cambió. Actualizá la vista.' using errcode='40001';end if;
 before_value:=case when item.id is null then null else to_jsonb(item) end;
 insert into supplier_source_aliases(source_book,source_alias,supplier_id,document_condition,business_label,status,reviewed_by,reviewed_at)
 values(p_payload->>'sourceBook',p_payload->>'sourceAlias',(p_payload->>'supplierId')::uuid,p_payload->>'condition',p_payload->>'businessLabel',p_payload->>'status',p_actor,clock_timestamp())
 on conflict(source_book,source_alias) do update set supplier_id=excluded.supplier_id,document_condition=excluded.document_condition,business_label=excluded.business_label,status=excluded.status,reviewed_by=p_actor,reviewed_at=clock_timestamp(),version=supplier_source_aliases.version+1 returning to_jsonb(supplier_source_aliases.*) into result;
 insert into supplier_alias_events(alias_id,actor_id,request_id,payload,before_value,after_value) values((result->>'id')::uuid,p_actor,p_request,p_payload,before_value,result);return result;
end $$;
revoke all on function review_supplier_alias(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function review_supplier_alias(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
