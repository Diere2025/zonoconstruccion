-- Migration V40: Enable Row Level Security (RLS) on public tables where it was missing
-- This resolves the critical security warning regarding publicly accessible tables (rls_disabled_in_public).

-- 1. Table: route_sheets
ALTER TABLE public.route_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select route_sheets" ON public.route_sheets;
CREATE POLICY "Authenticated users can select route_sheets" ON public.route_sheets
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage route_sheets" ON public.route_sheets;
CREATE POLICY "Authenticated users can manage route_sheets" ON public.route_sheets
    FOR ALL USING (auth.role() = 'authenticated');


-- 2. Table: faqs
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select faqs" ON public.faqs;
CREATE POLICY "Authenticated users can select faqs" ON public.faqs
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage faqs" ON public.faqs;
CREATE POLICY "Admins can manage faqs" ON public.faqs
    FOR ALL USING (public.is_admin());


-- 3. Table: quick_replies
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select quick_replies" ON public.quick_replies;
CREATE POLICY "Authenticated users can select quick_replies" ON public.quick_replies
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage quick_replies" ON public.quick_replies;
CREATE POLICY "Admins can manage quick_replies" ON public.quick_replies
    FOR ALL USING (public.is_admin());
