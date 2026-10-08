-- Procedencia para pedidos minoristas de la campaña de Látex Zono.
INSERT INTO public.advertising_sources (name, is_active)
SELECT 'Meta - Látex Zono', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.advertising_sources WHERE name = 'Meta - Látex Zono'
);

UPDATE public.advertising_sources
SET is_active = true
WHERE name = 'Meta - Látex Zono';
