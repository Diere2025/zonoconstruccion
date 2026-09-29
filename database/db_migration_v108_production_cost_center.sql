-- Add the Production cost center without duplicating an existing entry.
INSERT INTO public.cost_centers (name, code, description, is_active)
SELECT 'Producción', 'PROD', 'Gastos de producción, personal e insumos de fábrica', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.cost_centers
  WHERE code = 'PROD' OR lower(trim(name)) IN ('producción', 'produccion')
);

UPDATE public.cost_centers
SET is_active = true
WHERE lower(trim(name)) IN ('producción', 'produccion') AND is_active IS DISTINCT FROM true;
