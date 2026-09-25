BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_by_id
  ON public.orders(created_by_id);

COMMENT ON COLUMN public.orders.created_by_id IS
  'Usuario que cargó el pedido. seller_id identifica a la persona a quien se atribuye la venta.';

COMMIT;
