-- Backfill de Procedencia para los dos primeros pedidos de Facundo.
-- La fuente se verificó contra la hoja vigente "Pendientes".

BEGIN;

UPDATE orders
SET
  advertising_source_id = (
    SELECT id
    FROM advertising_sources
    WHERE lower(trim(name)) = 'mayorista'
    LIMIT 1
  ),
  channel = 'mayorista'
WHERE upper(trim(legacy_code)) = 'AQ-FP00001';

UPDATE orders
SET
  advertising_source_id = (
    SELECT id
    FROM advertising_sources
    WHERE lower(trim(name)) IN (
      'orgánico / cliente habitual / recomendado',
      'organico / cliente habitual / recomendado'
    )
    LIMIT 1
  ),
  channel = 'web_organica'
WHERE upper(trim(legacy_code)) = 'AQ-FP00006';

COMMIT;
