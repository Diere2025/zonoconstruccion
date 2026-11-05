BEGIN;
CREATE OR REPLACE FUNCTION public.outlet_effective_cost(u public.outlet_units) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(nullif(p.unified_cost,0),p.cost_price) FROM public.products p
 WHERE p.id=u.base_product_id AND NOT p.is_outlet_unit;
$$;
REVOKE ALL ON FUNCTION public.outlet_effective_cost(public.outlet_units) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outlet_effective_cost(public.outlet_units) TO authenticated;

-- Preserve the current reservation/stock guards; change only identity and cost sources.
DO $$
DECLARE source text; updated text;
BEGIN
 source:=pg_get_functiondef('public.outlet_sync_product()'::regprocedure);
 updated:=replace(source,'cost_price=NEW.cost_price,','cost_price=public.outlet_effective_cost(NEW),unified_cost=public.outlet_effective_cost(NEW),');
 updated:=replace(updated,''' · '' || CASE NEW.condition WHEN ''segunda'' THEN ''Segunda'' ELSE ''Outlet'' END || '' ['' || NEW.code || '']''',''' · '' || NEW.code');
 IF updated=source OR position('cost_price=NEW.cost_price' in updated)>0 THEN RAISE EXCEPTION 'Unexpected outlet product sync definition'; END IF;
 EXECUTE updated;
 source:=pg_get_functiondef('public.outlet_save_order(uuid,uuid,jsonb,jsonb)'::regprocedure);
 updated:=replace(source,'''version'',u.version)', '''version'',u.version,''base_product_id'',u.base_product_id,''unit_cost'',public.outlet_effective_cost(u))');
 updated:=replace(updated,'THEN u.cost_price ELSE','THEN coalesce((snap->>''unit_cost'')::numeric,public.outlet_effective_cost(u)) ELSE');
 updated:=replace(updated,'(snap->>''name'')||'' · ''||CASE snap->>''condition'' WHEN ''segunda'' THEN ''Segunda'' ELSE ''Outlet'' END||'' [''||(snap->>''code'')||''] · ''||coalesce(snap->>''defect'',snap->>''reason'')','(snap->>''name'')||'' · ''||(snap->>''code'')');
 IF updated=source OR position('THEN u.cost_price ELSE' in updated)>0 OR position('''unit_cost'',public.outlet_effective_cost(u)' in updated)=0 THEN RAISE EXCEPTION 'Unexpected outlet order save definition'; END IF;
 EXECUTE updated;
END; $$;

CREATE OR REPLACE FUNCTION public.outlet_refresh_base_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE flag text:=coalesce(current_setting('zono.outlet_write',true),'');
BEGIN
 IF NEW.is_outlet_unit THEN RETURN NEW; END IF;
 IF NEW.cost_price IS NOT DISTINCT FROM OLD.cost_price AND NEW.unified_cost IS NOT DISTINCT FROM OLD.unified_cost THEN RETURN NEW; END IF;
 PERFORM set_config('zono.outlet_write','on',true);
 UPDATE public.products p SET cost_price=coalesce(nullif(NEW.unified_cost,0),NEW.cost_price),
  unified_cost=coalesce(nullif(NEW.unified_cost,0),NEW.cost_price),unified_cost_status=NEW.unified_cost_status
 FROM public.outlet_units u WHERE u.base_product_id=NEW.id AND u.product_id=p.id;
 PERFORM set_config('zono.outlet_write',flag,true);
 RETURN NEW;
END; $$;
CREATE TRIGGER outlet_refresh_base_cost AFTER UPDATE OF cost_price,unified_cost ON public.products
FOR EACH ROW EXECUTE FUNCTION public.outlet_refresh_base_cost();

-- Existing unique product records inherit the base cost. Historical order lines stay untouched.
DO $$
DECLARE flag text:=coalesce(current_setting('zono.outlet_write',true),'');
BEGIN
 PERFORM set_config('zono.outlet_write','on',true);
 UPDATE public.products p SET name=u.name||' · '||u.code,cost_price=public.outlet_effective_cost(u),
  unified_cost=public.outlet_effective_cost(u),unified_cost_status=b.unified_cost_status
 FROM public.outlet_units u LEFT JOIN public.products b ON b.id=u.base_product_id
 WHERE u.product_id=p.id;
 PERFORM set_config('zono.outlet_write',flag,true);
END; $$;
COMMIT;
