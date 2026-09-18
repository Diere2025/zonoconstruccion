-- Procedencia utilizada por las cargas manuales del canal B2B.
-- Se mantiene separada de las procedencias de campañas de Zono.
INSERT INTO public.advertising_sources (name, is_active)
SELECT 'Mayorista', true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.advertising_sources
  WHERE lower(name) = 'mayorista'
);
