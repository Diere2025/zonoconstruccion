-- Migration V41: Allow public access on seller_phone_lines to match phone_lines table
DROP POLICY IF EXISTS "Allow authenticated users full access on seller_phone_lines" ON public.seller_phone_lines;
DROP POLICY IF EXISTS "Allow public users full access on seller_phone_lines" ON public.seller_phone_lines;

CREATE POLICY "Allow public users full access on seller_phone_lines"
ON public.seller_phone_lines
FOR ALL
TO public
USING (true)
WITH CHECK (true);
