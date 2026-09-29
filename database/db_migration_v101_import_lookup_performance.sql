-- The import fallback searches grouped codes with ILIKE '%code%'.
-- A btree on legacy_code cannot accelerate that query.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_orders_legacy_code ON public.orders (legacy_code);
CREATE INDEX IF NOT EXISTS idx_orders_legacy_code_trgm
  ON public.orders USING gin (legacy_code gin_trgm_ops);

-- Batch preloads used by import-sheet.
CREATE INDEX IF NOT EXISTS idx_clients_phone_primary ON public.clients (phone_primary);
CREATE INDEX IF NOT EXISTS idx_clients_phone_secondary ON public.clients (phone_secondary);
CREATE INDEX IF NOT EXISTS idx_addresses_client_id ON public.addresses (client_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
