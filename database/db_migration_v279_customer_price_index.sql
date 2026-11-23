BEGIN;

-- IPC nacional, nivel general, base diciembre de 2016 = 100. Serie oficial
-- 148.3_INIVELNAL_DICI_M_26 del INDEC publicada en Datos Argentina.
CREATE TABLE IF NOT EXISTS public.customer_price_index (
  month date PRIMARY KEY CHECK (extract(day FROM month) = 1),
  index_value numeric NOT NULL CHECK (index_value > 0 AND index_value < 1000000000),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_price_index ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_price_index FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_price_index TO service_role;

COMMIT;
