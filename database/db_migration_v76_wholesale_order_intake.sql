-- Procedencias comerciales B2B, detalle libre para "Otro" y consolidación de
-- la dirección completa de Claudio Fabian Lespade.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS advertising_source_detail TEXT;

INSERT INTO public.advertising_sources (name, is_active)
SELECT source_name, true
FROM unnest(ARRAY[
  'Cliente',
  'Página web',
  'Reenviado de Minorista',
  'Recomendado',
  'Otro'
]) AS source_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.advertising_sources existing
  WHERE lower(trim(existing.name)) = lower(trim(source_name))
);

UPDATE public.advertising_sources
SET is_active = true
WHERE lower(trim(name)) IN (
  'cliente',
  'página web',
  'reenviado de minorista',
  'recomendado',
  'otro'
);

-- Respaldar la dirección redundante antes de retirarla. La dirección canónica
-- ya contiene localidad, entrecalles y enlace de Maps.
INSERT INTO public.client_merge_backups
  (batch_key, entity_type, entity_id, source_client_id, snapshot)
SELECT
  'lespade-address-cleanup-2026-09-18',
  'address',
  address.id::text,
  address.client_id,
  to_jsonb(address)
FROM public.addresses address
WHERE address.id IN (
  '92ca0d81-4888-4ad2-96b6-f59c302d01a9',
  '25304850-6a5d-4548-ba82-ec3a27e3a08d'
)
ON CONFLICT DO NOTHING;

UPDATE public.orders
SET shipping_address_id = '92ca0d81-4888-4ad2-96b6-f59c302d01a9'
WHERE shipping_address_id = '25304850-6a5d-4548-ba82-ec3a27e3a08d';

UPDATE public.addresses
SET is_default = true,
    alias = 'Principal',
    full_address = 'Monteagudo 493 (e/ Cortajena)',
    locality_id = 'cc5e91ef-c192-4acd-b28e-7cb159ad0bcd',
    map_link = 'https://maps.app.goo.gl/VKV4X5wBYuq9grZG6'
WHERE id = '92ca0d81-4888-4ad2-96b6-f59c302d01a9';

DELETE FROM public.addresses
WHERE id = '25304850-6a5d-4548-ba82-ec3a27e3a08d';

COMMIT;
