-- Migration V67: Sistema Jerárquico de Categorías Padre y Subcategorías
-- Ejecutar en Supabase SQL Editor

-- 1. Tabla de Categorías (Autoreferenciada para relación Padre -> Subcategoría)
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT,
    parent_id UUID REFERENCES public.product_categories(id) ON DELETE CASCADE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view product categories" ON public.product_categories;
CREATE POLICY "Anyone can view product categories" ON public.product_categories
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage product categories" ON public.product_categories;
CREATE POLICY "Admins can manage product categories" ON public.product_categories
    FOR ALL USING (public.is_admin());

-- 2. Campos de subcategoría en la tabla de productos
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;

-- 3. Seed inicial de Categorías Padre
INSERT INTO public.product_categories (name, slug, parent_id, display_order) VALUES
('Tanques de Agua', 'tanques-de-agua', NULL, 1),
('Biodigestores', 'biodigestores', NULL, 2),
('Pinturas', 'pinturas', NULL, 3),
('Herramientas', 'herramientas', NULL, 4),
('Termotanques', 'termotanques', NULL, 5),
('Caños Termofusión', 'canos-termofusion', NULL, 6),
('MEPS', 'meps', NULL, 7),
('Escaleras', 'escaleras', NULL, 8),
('Insumos', 'insumos', NULL, 9),
('Otros', 'otros', NULL, 99)
ON CONFLICT DO NOTHING;

-- 4. Seed inicial de Subcategorías vinculadas a su Categoría Padre
DO $$
DECLARE
    parent_tanques UUID;
    parent_bio UUID;
    parent_pinturas UUID;
    parent_herramientas UUID;
BEGIN
    SELECT id INTO parent_tanques FROM public.product_categories WHERE name = 'Tanques de Agua' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO parent_bio FROM public.product_categories WHERE name = 'Biodigestores' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO parent_pinturas FROM public.product_categories WHERE name = 'Pinturas' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO parent_herramientas FROM public.product_categories WHERE name = 'Herramientas' AND parent_id IS NULL LIMIT 1;

    IF parent_tanques IS NOT NULL THEN
        INSERT INTO public.product_categories (name, slug, parent_id) VALUES
        ('Tanques Tricapa Beige', 'tanques-tricapa-beige', parent_tanques),
        ('Tanques Tricapa Oferta', 'tanques-tricapa-oferta', parent_tanques),
        ('Tanques Bicapa', 'tanques-bicapa', parent_tanques),
        ('Tanques Cisterna', 'tanques-cisterna', parent_tanques),
        ('Tanques Cuatricapa', 'tanques-cuatricapa', parent_tanques),
        ('Complementos para tanques', 'complementos-para-tanques', parent_tanques)
        ON CONFLICT DO NOTHING;
    END IF;

    IF parent_bio IS NOT NULL THEN
        INSERT INTO public.product_categories (name, slug, parent_id) VALUES
        ('Cámaras Sépticas', 'camaras-septicas', parent_bio),
        ('Cámaras Desengrasadoras', 'camaras-desengrasadoras', parent_bio),
        ('Biodigestores Autolimpiables', 'biodigestores-autolimpiables', parent_bio),
        ('Registro Lodos', 'registro-lodos', parent_bio)
        ON CONFLICT DO NOTHING;
    END IF;

    IF parent_pinturas IS NOT NULL THEN
        INSERT INTO public.product_categories (name, slug, parent_id) VALUES
        ('Herramientas de pintura', 'herramientas-de-pintura', parent_pinturas),
        ('Accesorios de pintura', 'accesorios-de-pintura', parent_pinturas)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
