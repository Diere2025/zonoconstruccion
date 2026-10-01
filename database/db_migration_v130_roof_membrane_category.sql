-- Las membranas para techos pertenecen a MEPS.
UPDATE public.products
SET category = 'MEPS'
WHERE name ~* 'membrana\s+techos?\M'
  AND category IS DISTINCT FROM 'MEPS';
