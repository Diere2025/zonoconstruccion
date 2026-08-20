-- Migration V36: Many-to-Many relationship between sellers and phone lines
CREATE TABLE IF NOT EXISTS public.seller_phone_lines (
    seller_id UUID REFERENCES public.sellers(id) ON DELETE CASCADE,
    phone_line_id UUID REFERENCES public.phone_lines(id) ON DELETE CASCADE,
    PRIMARY KEY (seller_id, phone_line_id)
);

-- Migrate existing non-null seller_id relations from phone_lines
INSERT INTO public.seller_phone_lines (seller_id, phone_line_id)
SELECT seller_id, id FROM public.phone_lines
WHERE seller_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.seller_phone_lines ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
DROP POLICY IF EXISTS "Allow authenticated users full access on seller_phone_lines" ON public.seller_phone_lines;
CREATE POLICY "Allow authenticated users full access on seller_phone_lines"
ON public.seller_phone_lines
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
