-- Consolida duplicados confirmados por nombre y teléfono entre las dos fuentes
-- mayoristas. Conserva pedidos, pagos y múltiples direcciones. La dirección
-- usada por el pedido más reciente queda como predeterminada.

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_merge_history (
  duplicate_client_id UUID PRIMARY KEY,
  canonical_client_id UUID NOT NULL,
  batch_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  canonical_name TEXT,
  duplicate_name TEXT,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_merge_backups (
  id BIGSERIAL PRIMARY KEY,
  batch_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_client_id UUID,
  snapshot JSONB NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_key, entity_type, entity_id)
);

CREATE TEMP TABLE merge_candidates (
  canonical_id UUID PRIMARY KEY,
  duplicate_id UUID NOT NULL UNIQUE,
  reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO merge_candidates (canonical_id, duplicate_id, reason) VALUES
('f9fa957d-2d0c-46e0-8a32-bff9ddf52d1e','10772c51-e742-474c-8a99-4d30ddecd319','same normalized name and phone'),
('6941527f-7a5e-4aa8-845a-dab76adc86a3','3fb468cb-aa00-49ea-8de6-977b6d5c7cea','same normalized name and phone'),
('a7e3b086-aa6e-4895-972a-31911a6c34bc','631663e0-597e-41ee-81d1-356cf6064243','same normalized name and phone'),
('ed58e540-7d5a-414c-adc4-c8416b34be7f','9a8ed1db-af9e-4635-8dc4-c84efdb8c14d','same normalized name and phone'),
('809ace64-897e-4fcf-8fe3-ff0c9a231d5c','6e174f73-d9ab-4454-bef7-99fa64a8a04e','same normalized name and phone'),
('e977fbb0-fb46-49bd-8eb5-d7b2e94ce544','10d4cd4f-0c2e-4fdc-9d80-da778f7f0fd4','same normalized name and phone'),
('7f3f606a-d105-4752-8c23-7a4bde4a5f84','5d4aca82-89c5-405e-99ed-e1b39f2a8ed4','same normalized name and phone'),
('6ca962ad-bf4d-44aa-bbe0-8d2bdbdc5ccb','340ec7b7-92f1-47e5-b1b4-b2d5321791ff','same normalized name and phone'),
('3bf0f729-91f0-4675-acd1-80d8e84d1a88','0d258580-2016-47a3-8fdb-b08311e44b7e','same normalized name and phone'),
('bf380b3e-dacc-436c-8172-348b6994382e','7f67b770-0fca-4a2e-ae05-110bca30fa08','same normalized name and phone'),
('38b3bb53-d0a6-4ec6-b7bb-fe90f4291f97','2ed7b4dc-c3b8-4b73-b586-ca04f49c621b','same normalized name and phone'),
('aa97102f-2e67-4a13-84bd-2d33b19bd494','7f43ed64-23c5-4d1f-ae8d-d791bda9e942','same normalized name and phone'),
('aa6062b4-47b7-4b4f-baa9-c001af3ed8c3','e5e8536e-0d92-485b-ac96-0d46d8b44752','same normalized name and phone'),
('74e847a4-fd20-4d5f-a799-e1399d55932a','c12fa7e0-267f-4cc1-a5c8-f7c9c6fab309','same normalized name and phone'),
('583db104-e06a-4424-9c3a-e3c9a2fa2c7d','60cae868-ae79-4eec-ba19-28f42a472054','same normalized name and phone'),
('3f7ddcbb-11c7-4da1-abe3-4dbf81b95a63','bd2664ae-75cb-4020-b132-8a18b55649af','same normalized name and phone'),
('6fc3c405-aac1-4fd7-8ee7-6db4a8aa34a5','97e1f04b-bc4c-4549-9f5f-60861c234eb1','same normalized name and phone'),
('2698c227-4af0-4d62-8472-9cfb40f573ab','5a7ab5e4-2446-4d94-b989-ac9d83689d06','same normalized name and phone'),
('a1b7336e-d717-4d35-bf8e-aad6a502b37d','b4243d18-32e5-4c8f-95fd-bed22c6a679d','same normalized name and phone'),
('74187067-2529-4d9b-ae09-ecf5348f751a','d9c8466b-5c98-4d6c-964e-29e6ace39d7b','same normalized name and phone'),
('20d48a06-9aba-42b5-9bc2-ded0fede0796','1d6fc55d-c23e-4d58-bb1c-3eca22bc5a34','same phone and near-identical name'),
('4f4ab066-4fc2-4fb8-8688-8821ad23ed65','aae0802d-f01c-4f79-83f0-d20e4f9ad08c','same normalized name and phone'),
('02188399-5b48-485d-94bd-b9a7f6661e62','7d1d0157-540d-4dc5-81ab-822cacaea571','same normalized name and phone'),
('cdd02e18-0161-4487-883b-fa97e299fbde','fa0c8aac-8910-4127-bc8f-370f92f93e8b','same phone and near-identical name'),
('1addba58-1b5f-42af-a0d1-d3049050c562','962032d6-65f6-465a-b535-2ef621e9f596','same normalized name and phone'),
('381137f9-ffe6-449b-9c2a-620026964e7e','609fc4cb-4ad1-4e79-94a8-9e013b9b76f5','same normalized name and phone'),
('69ec3adf-0d8a-4333-ae28-73e1dc99ccf6','dc14f50e-6f55-4b5e-b879-48209b732768','same normalized name and phone'),
('3f7e5af3-fd9b-4e29-80dc-c9af24af1b03','acf8ccad-7673-4c0c-a682-cd06bc5d728e','same phone and near-identical name'),
('0f311663-1da9-43d7-9da1-07cdda799d9c','c160589f-427b-4ab5-86f8-754adf35b2f7','same normalized name and phone'),
('b1ea6c17-cc18-40de-999d-1bbbf6e359b1','d2154a45-a969-4760-99d6-c5acd9e394f1','same normalized name and phone');

DO $$
DECLARE
  canonical_count INTEGER;
  duplicate_count INTEGER;
BEGIN
  SELECT count(*) INTO canonical_count
  FROM merge_candidates m JOIN public.clients c ON c.id = m.canonical_id;
  SELECT count(*) INTO duplicate_count
  FROM merge_candidates m JOIN public.clients c ON c.id = m.duplicate_id;
  IF canonical_count <> 30 THEN
    RAISE EXCEPTION 'Expected 30 canonical clients, found %', canonical_count;
  END IF;
  IF duplicate_count NOT IN (0, 30) THEN
    RAISE EXCEPTION 'Partial merge state detected: % of 30 duplicate clients exist', duplicate_count;
  END IF;
END $$;

INSERT INTO public.client_merge_backups (batch_key, entity_type, entity_id, source_client_id, snapshot)
SELECT 'wholesale-duplicates-2026-09-18', 'client', c.id::text, c.id, to_jsonb(c)
FROM public.clients c
JOIN (
  SELECT canonical_id AS id FROM merge_candidates
  UNION
  SELECT duplicate_id FROM merge_candidates
) ids ON ids.id = c.id
ON CONFLICT DO NOTHING;

INSERT INTO public.client_merge_backups (batch_key, entity_type, entity_id, source_client_id, snapshot)
SELECT 'wholesale-duplicates-2026-09-18', 'address', a.id::text, a.client_id, to_jsonb(a)
FROM public.addresses a
JOIN merge_candidates m ON a.client_id IN (m.canonical_id, m.duplicate_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.client_merge_backups (batch_key, entity_type, entity_id, source_client_id, snapshot)
SELECT 'wholesale-duplicates-2026-09-18', 'order', o.id::text, o.client_id, to_jsonb(o)
FROM public.orders o
JOIN merge_candidates m ON o.client_id IN (m.canonical_id, m.duplicate_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.client_merge_backups (batch_key, entity_type, entity_id, source_client_id, snapshot)
SELECT 'wholesale-duplicates-2026-09-18', 'client_payment', p.id::text, p.client_id, to_jsonb(p)
FROM public.client_payments p
JOIN merge_candidates m ON p.client_id IN (m.canonical_id, m.duplicate_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.client_merge_backups (batch_key, entity_type, entity_id, source_client_id, snapshot)
SELECT 'wholesale-duplicates-2026-09-18', 'mp_payment', p.id::text, p.client_id, to_jsonb(p)
FROM public.mp_payments p
JOIN merge_candidates m ON p.client_id IN (m.canonical_id, m.duplicate_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.client_merge_history
  (duplicate_client_id, canonical_client_id, batch_key, reason, canonical_name, duplicate_name)
SELECT m.duplicate_id, m.canonical_id, 'wholesale-duplicates-2026-09-18', m.reason,
       canonical.business_name, duplicate.business_name
FROM merge_candidates m
JOIN public.clients canonical ON canonical.id = m.canonical_id
JOIN public.clients duplicate ON duplicate.id = m.duplicate_id
ON CONFLICT (duplicate_client_id) DO NOTHING;

-- Completar el registro canónico con la información más rica de ambas fuentes.
UPDATE public.clients canonical
SET
  aliases = ARRAY(
    SELECT DISTINCT alias_value
    FROM unnest(
      COALESCE(canonical.aliases, ARRAY[]::TEXT[])
      || COALESCE(duplicate.aliases, ARRAY[]::TEXT[])
      || ARRAY[duplicate.business_name]
    ) AS alias_value
    WHERE NULLIF(trim(alias_value), '') IS NOT NULL
  ),
  phone_secondary = COALESCE(
    NULLIF(canonical.phone_secondary, ''),
    NULLIF(NULLIF(duplicate.phone_secondary, ''), canonical.phone_primary),
    NULLIF(NULLIF(duplicate.phone_primary, ''), canonical.phone_primary)
  ),
  tax_id = COALESCE(NULLIF(canonical.tax_id, ''), NULLIF(duplicate.tax_id, '')),
  billing_address = COALESCE(NULLIF(canonical.billing_address, ''), NULLIF(duplicate.billing_address, '')),
  email = COALESCE(NULLIF(canonical.email, ''), NULLIF(duplicate.email, '')),
  internal_code = COALESCE(NULLIF(canonical.internal_code, ''), NULLIF(duplicate.internal_code, '')),
  code = COALESCE(NULLIF(canonical.code, ''), NULLIF(duplicate.code, '')),
  is_wholesale = COALESCE(canonical.is_wholesale, false) OR COALESCE(duplicate.is_wholesale, false),
  client_type = CASE
    WHEN COALESCE(canonical.is_wholesale, false) OR COALESCE(duplicate.is_wholesale, false) THEN 'Mayorista'
    ELSE COALESCE(canonical.client_type, duplicate.client_type)
  END,
  default_discount_coef = CASE
    WHEN (canonical.default_discount_coef IS NULL OR canonical.default_discount_coef = 1)
      AND duplicate.default_discount_coef IS NOT NULL
      THEN duplicate.default_discount_coef
    ELSE canonical.default_discount_coef
  END,
  default_discount_label = COALESCE(NULLIF(canonical.default_discount_label, ''), NULLIF(duplicate.default_discount_label, '')),
  notes = NULLIF(concat_ws(E'\n', NULLIF(canonical.notes, ''), NULLIF(duplicate.notes, '')), '')
FROM merge_candidates m
JOIN public.clients duplicate ON duplicate.id = m.duplicate_id
WHERE canonical.id = m.canonical_id;

-- Si la misma dirección existe en ambos registros, preservar la canónica y
-- hacer que los pedidos de la copia apunten a ella.
CREATE TEMP TABLE address_merge_map ON COMMIT DROP AS
SELECT DISTINCT ON (duplicate_address.id)
  duplicate_address.id AS duplicate_address_id,
  canonical_address.id AS canonical_address_id
FROM merge_candidates m
JOIN public.addresses duplicate_address ON duplicate_address.client_id = m.duplicate_id
JOIN public.addresses canonical_address ON canonical_address.client_id = m.canonical_id
  AND canonical_address.locality_id IS NOT DISTINCT FROM duplicate_address.locality_id
  AND regexp_replace(
        translate(lower(trim(canonical_address.full_address)), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]', '', 'g'
      ) = regexp_replace(
        translate(lower(trim(duplicate_address.full_address)), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]', '', 'g'
      )
ORDER BY duplicate_address.id, canonical_address.created_at NULLS LAST, canonical_address.id;

UPDATE public.orders o
SET shipping_address_id = address_map.canonical_address_id
FROM address_merge_map address_map
WHERE o.shipping_address_id = address_map.duplicate_address_id;

DELETE FROM public.addresses a
USING address_merge_map address_map
WHERE a.id = address_map.duplicate_address_id;

-- Las direcciones realmente distintas se conservan como alternativas.
UPDATE public.addresses a
SET client_id = m.canonical_id
FROM merge_candidates m
WHERE a.client_id = m.duplicate_id;

UPDATE public.orders o
SET client_id = m.canonical_id
FROM merge_candidates m
WHERE o.client_id = m.duplicate_id;

UPDATE public.client_payments p
SET client_id = m.canonical_id
FROM merge_candidates m
WHERE p.client_id = m.duplicate_id;

UPDATE public.mp_payments p
SET client_id = m.canonical_id
FROM merge_candidates m
WHERE p.client_id = m.duplicate_id;

-- Una sola predeterminada por cliente: la del pedido más reciente. Si nunca se
-- utilizó una dirección, se toma la más recientemente creada.
UPDATE public.addresses a
SET is_default = false
FROM merge_candidates m
WHERE a.client_id = m.canonical_id;

WITH latest_used AS (
  SELECT DISTINCT ON (o.client_id)
    o.client_id,
    o.shipping_address_id
  FROM public.orders o
  JOIN merge_candidates m ON m.canonical_id = o.client_id
  JOIN public.addresses a ON a.id = o.shipping_address_id AND a.client_id = o.client_id
  WHERE o.shipping_address_id IS NOT NULL
  ORDER BY o.client_id, o.order_date DESC, o.created_at DESC NULLS LAST, o.id DESC
), fallback AS (
  SELECT DISTINCT ON (a.client_id)
    a.client_id,
    a.id AS shipping_address_id
  FROM public.addresses a
  JOIN merge_candidates m ON m.canonical_id = a.client_id
  ORDER BY a.client_id, a.created_at DESC NULLS LAST, a.id DESC
), chosen AS (
  SELECT f.client_id, COALESCE(l.shipping_address_id, f.shipping_address_id) AS address_id
  FROM fallback f
  LEFT JOIN latest_used l ON l.client_id = f.client_id
)
UPDATE public.addresses a
SET is_default = true
FROM chosen c
WHERE a.id = c.address_id;

DELETE FROM public.clients duplicate
USING merge_candidates m
WHERE duplicate.id = m.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_one_default_per_client
  ON public.addresses(client_id)
  WHERE is_default = true;

COMMIT;
