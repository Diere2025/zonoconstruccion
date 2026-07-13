-- Migration V42: Allow public access on order_mediums and advertising_sources tables
DROP POLICY IF EXISTS "select_order_mediums" ON public.order_mediums;
DROP POLICY IF EXISTS "Allow public users full access on order_mediums" ON public.order_mediums;

CREATE POLICY "Allow public users full access on order_mediums"
ON public.order_mediums
FOR ALL
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "select_advertising_sources" ON public.advertising_sources;
DROP POLICY IF EXISTS "Allow public users full access on advertising_sources" ON public.advertising_sources;

CREATE POLICY "Allow public users full access on advertising_sources"
ON public.advertising_sources
FOR ALL
TO public
USING (true)
WITH CHECK (true);
