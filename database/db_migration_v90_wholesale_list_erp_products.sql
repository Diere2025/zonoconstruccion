-- Vincula cada renglón de la lista mayorista con el producto real del ERP.
-- Presupuestos y pedidos comparten así el mismo identificador de producto.
ALTER TABLE public.wholesale_price_list_items
  ADD COLUMN IF NOT EXISTS erp_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wholesale_price_list_items_erp_product
  ON public.wholesale_price_list_items(erp_product_id);
