BEGIN;
-- Same retail pricing formula as src/lib/erp/prices.ts, evaluated inside the
-- reservation transaction so a stale browser cannot choose its own base price.
CREATE OR REPLACE FUNCTION public.outlet_effective_list(u public.outlet_units) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.products; amount numeric; supplier_discount numeric; currency text; exchange_rate numeric;
BEGIN
 IF u.price_mode='manual' THEN RETURN u.list_price; END IF;
 SELECT * INTO p FROM public.products WHERE id=u.base_product_id AND NOT is_outlet_unit;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF coalesce(p.fixed_price,false) OR coalesce(p.sku,'')='' THEN RETURN p.price; END IF;
 SELECT li.final_cost,s.base_discount_percentage,pl.currency INTO amount,supplier_discount,currency
 FROM public.product_supplier_relations r JOIN public.suppliers s ON s.id=r.supplier_id
 JOIN public.price_lists pl ON pl.supplier_id=s.id AND pl.is_active
 JOIN public.price_list_items li ON li.price_list_id=pl.id AND li.sku=p.sku
 WHERE r.product_id=p.id AND r.is_primary LIMIT 1;
 IF NOT FOUND THEN RETURN p.price; END IF;
 IF currency='USD' THEN
  SELECT CASE WHEN value ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(value::numeric,0) END INTO exchange_rate FROM public.site_settings WHERE id='usd_exchange_rate';
  amount:=coalesce(amount,0)*coalesce(exchange_rate,1465);
 END IF;
 RETURN round(coalesce(amount,0)*(1-coalesce(supplier_discount,0)/100)*(1+coalesce(p.markup_percentage,0)/100),2);
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
