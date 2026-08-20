-- Fix category for Termotanques products
UPDATE public.products
SET category = 'Termotanques'
WHERE (LOWER(name) LIKE '%termotanque%' OR LOWER(sku) LIKE '%termotanque%' OR LOWER(sku) LIKE '%tue%')
  AND category != 'Termotanques';
