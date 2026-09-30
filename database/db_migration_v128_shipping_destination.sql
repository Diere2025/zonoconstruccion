-- Optional postal code and map URL for shipping requests, preserving the audited wrapper.
do $migration$
declare source text; old_required text; new_required text; old_summary text; new_summary text;
begin
 perform pg_advisory_xact_lock(106106);
 source:=pg_get_functiondef('public.support_command(text,uuid,uuid,integer,jsonb)'::regprocedure);
 old_required:=$old$array['locality','province','postal_code','products']$old$;
 new_required:=$new$array['locality','province','products']$new$;
 if strpos(source,old_required)>0 then source:=replace(source,old_required,new_required);
 elsif strpos(source,new_required)=0 then raise exception 'Unexpected shipping validation definition'; end if;
 old_summary:=$old$summary:=format(E'Destino: %s, %s · CP %s\nDirección: %s\nCliente: %s\nReferencia de presupuesto/pedido: %s\nProductos y cantidades:\n%s\nCondiciones de entrega:\n%s',r->>'locality',r->>'province',r->>'postal_code',coalesce(r->>'address',''),coalesce(r->>'customer',''),coalesce(r->>'reference',''),r->>'products',coalesce(r->>'conditions',''));$old$;
 new_summary:=$new$if r ? 'map_url' and (jsonb_typeof(r->'map_url') is distinct from 'string' or length(r->>'map_url')>2000 or (coalesce(r->>'map_url','')<>'' and r->>'map_url' !~ '^https?://[^[:space:]]+$')) then raise exception 'SHIPPING_REQUEST_INVALID'; end if;
   summary:=format(E'Destino: %s, %s%s\nDirección: %s\nCliente: %s\nReferencia de presupuesto/pedido: %s\nProductos y cantidades:\n%s\nCondiciones de entrega:\n%s',r->>'locality',r->>'province',case when coalesce(trim(r->>'postal_code'),'')<>'' then ' · CP '||(r->>'postal_code') else '' end,coalesce(r->>'address',''),coalesce(r->>'customer',''),coalesce(r->>'reference',''),r->>'products',coalesce(r->>'conditions',''));
   if coalesce(r->>'map_url','')<>'' then summary:=summary||E'\nMapa: '||(r->>'map_url'); end if;$new$;
 if strpos(source,old_summary)>0 then source:=replace(source,old_summary,new_summary);
 elsif strpos(source,new_summary)=0 then raise exception 'Unexpected shipping summary definition'; end if;
 execute source;
end $migration$;
