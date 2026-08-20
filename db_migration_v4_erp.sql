-- Migration V4: ERP Modular (ZonoPedidos ➔ Supabase)
-- Ejecutar en el SQL Editor de Supabase en el esquema public

-- 0. Función de utilidad para evitar recursión RLS al verificar rol de administrador
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.sellers 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Modificación de tabla products (inventario maestro)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS fixed_price BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS markup_percentage NUMERIC DEFAULT 0, -- recargo minorista
ADD COLUMN IF NOT EXISTS markup_wholesale_percentage NUMERIC DEFAULT 0, -- recargo mayorista
ADD COLUMN IF NOT EXISTS is_discontinued BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS volume NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS weight NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_physical NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_reserved NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_current NUMERIC DEFAULT 0;

-- 2. Modificación de tabla sellers (vendedores)
ALTER TABLE public.sellers 
ADD COLUMN IF NOT EXISTS seller_type TEXT NOT NULL DEFAULT 'minorista' CHECK (seller_type IN ('minorista', 'mayorista'));

-- 3. Tabla de Proveedores (suppliers)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    legal_name TEXT,
    cuit TEXT,
    base_discount_percentage NUMERIC DEFAULT 0,
    delivery_time_days INT DEFAULT 0,
    bank_details JSONB, -- name, account, cbu, alias
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Tabla de Listas de Precios de Costo (price_lists)
CREATE TABLE IF NOT EXISTS public.price_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    list_number TEXT NOT NULL,
    list_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Tabla de Ítems de Lista de Precios (price_list_items)
CREATE TABLE IF NOT EXISTS public.price_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id UUID REFERENCES public.price_lists(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    list_cost NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
    taxes NUMERIC DEFAULT 21.0, -- IVA
    final_cost NUMERIC GENERATED ALWAYS AS (
        CASE 
            WHEN discount_type = 'percentage' THEN (list_cost * (1 - discount / 100)) * (1 + taxes / 100)
            ELSE (list_cost - discount) * (1 + taxes / 100)
        END
    ) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Relación Producto-Proveedor (product_supplier_relations)
CREATE TABLE IF NOT EXISTS public.product_supplier_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(product_id, supplier_id)
);

-- 7. Tabla de Clientes (clients)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internal_code TEXT UNIQUE,
    code TEXT,
    business_name TEXT NOT NULL,
    aliases TEXT[],
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT,
    tax_id TEXT, -- CUIT o DNI
    billing_address TEXT,
    credit_limit NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. Tabla de Direcciones de Entrega (addresses)
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    full_address TEXT NOT NULL,
    locality_id UUID REFERENCES public.localities(id) ON DELETE RESTRICT,
    map_link TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. Modificación de tabla orders (pedidos de venta)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shipping_address_snapshot JSONB,
ADD COLUMN IF NOT EXISTS totals JSONB,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pendiente' CHECK (payment_status IN ('Pendiente', 'Parcial', 'Pagado')),
ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'vendedor_externo' CHECK (channel IN ('web_organica', 'mostrador_minorista', 'mayorista', 'vendedor_externo')),
ADD COLUMN IF NOT EXISTS invoice_requested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS invoice_type TEXT CHECK (invoice_type IN ('A', 'B', 'C', 'M')),
ADD COLUMN IF NOT EXISTS invoice_cuit TEXT,
ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'Pendiente',
ADD COLUMN IF NOT EXISTS invoice_url TEXT,
ADD COLUMN IF NOT EXISTS logistics_zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL;

-- 10. Modificación de tabla order_items (detalle del pedido)
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS historical_unit_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC DEFAULT 0;

-- 11. Tabla de Pagos de Comisiones (commission_payouts)
CREATE TABLE IF NOT EXISTS public.commission_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES public.sellers(id) ON DELETE RESTRICT,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payout_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    payment_method TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 12. Tabla de Transacciones de Inventario (inventory_transactions)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Ajuste', 'Compra', 'Reserva Pedido', 'Cancelacion Pedido', 'Entrega')),
    reference_id UUID, -- pedido u orden de compra
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 12b. Función y Trigger para calcular y mantener los 3 estados de stock en productos
CREATE OR REPLACE FUNCTION public.update_product_stock_levels()
RETURNS TRIGGER AS $$
DECLARE
  v_is_discontinued BOOLEAN;
  v_stock_current NUMERIC;
BEGIN
  -- Obtener info del producto
  SELECT is_discontinued, stock_current INTO v_is_discontinued, v_stock_current
  FROM public.products
  WHERE id = NEW.product_id;

  -- Validar si está descontinuado y el stock quedaría en negativo
  IF v_is_discontinued AND (v_stock_current + NEW.quantity) < 0 AND NEW.type IN ('Reserva Pedido', 'Ajuste') THEN
    RAISE EXCEPTION 'No hay suficiente stock disponible para el producto descontinuado.';
  END IF;

  -- Actualizar niveles en base al tipo de movimiento
  IF NEW.type = 'Ajuste' OR NEW.type = 'Compra' THEN
    UPDATE public.products
    SET 
      stock_physical = stock_physical + NEW.quantity,
      stock_current = stock_current + NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Reserva Pedido' THEN
    UPDATE public.products
    SET 
      stock_reserved = stock_reserved + NEW.quantity,
      stock_current = stock_current - NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Cancelacion Pedido' THEN
    UPDATE public.products
    SET 
      stock_reserved = stock_reserved - NEW.quantity,
      stock_current = stock_current + NEW.quantity
    WHERE id = NEW.product_id;

  ELSIF NEW.type = 'Entrega' THEN
    -- Al entregar, se reduce el stock físico y se libera la reserva. El stock_current no cambia.
    UPDATE public.products
    SET 
      stock_physical = stock_physical - NEW.quantity,
      stock_reserved = stock_reserved - NEW.quantity
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS trg_inventory_transaction_inserted ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transaction_inserted
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_product_stock_levels();


-- 13. Vista para calcular balances de comisiones (seller_commission_balances)
CREATE OR REPLACE VIEW public.seller_commission_balances AS
SELECT 
    s.id AS seller_id,
    s.full_name,
    s.commission_rate,
    COALESCE(SUM(o.total_amount * (s.commission_rate / 100)), 0) AS total_commission_earned,
    COALESCE(p.total_paid, 0) AS total_commission_paid,
    (COALESCE(SUM(o.total_amount * (s.commission_rate / 100)), 0) - COALESCE(p.total_paid, 0)) AS commission_available
FROM public.sellers s
LEFT JOIN (
    SELECT seller_id, total_amount 
    FROM public.orders 
    WHERE status = 'Entregado'
) o ON o.seller_id = s.id
LEFT JOIN (
    SELECT seller_id, SUM(amount) AS total_paid 
    FROM public.commission_payouts 
    GROUP BY seller_id
) p ON p.seller_id = s.id
GROUP BY s.id, s.full_name, s.commission_rate, p.total_paid;

-- 14. Habilitar RLS en todas las nuevas tablas
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_supplier_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Asegurar RLS en las existentes
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 15. Políticas RLS para la fuerza de ventas

-- SELLERS
DROP POLICY IF EXISTS "Sellers can view their own profile" ON public.sellers;
CREATE POLICY "Sellers can view their own profile" ON public.sellers
    FOR SELECT USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update sellers" ON public.sellers;
CREATE POLICY "Admins can update sellers" ON public.sellers
    FOR ALL USING (public.is_admin());

-- SUPPLIERS, PRICE LISTS, PRICE LIST ITEMS, RELATIONS
-- Solo los admins pueden ver/editar proveedores y sus costos
DROP POLICY IF EXISTS "Admins can manage suppliers" ON public.suppliers;
CREATE POLICY "Admins can manage suppliers" ON public.suppliers USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage price lists" ON public.price_lists;
CREATE POLICY "Admins can manage price lists" ON public.price_lists USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage price list items" ON public.price_list_items;
CREATE POLICY "Admins can manage price list items" ON public.price_list_items USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage product supplier relations" ON public.product_supplier_relations;
CREATE POLICY "Admins can manage product supplier relations" ON public.product_supplier_relations USING (public.is_admin());

-- CLIENTS
-- Vendedores pueden ver clientes. Admin puede hacer todo.
DROP POLICY IF EXISTS "Everyone authenticated can read clients" ON public.clients;
CREATE POLICY "Everyone authenticated can read clients" ON public.clients
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage clients" ON public.clients;
CREATE POLICY "Admins can manage clients" ON public.clients
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Sellers can insert clients" ON public.clients;
CREATE POLICY "Sellers can insert clients" ON public.clients
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ADDRESSES
DROP POLICY IF EXISTS "Everyone authenticated can read addresses" ON public.addresses;
CREATE POLICY "Everyone authenticated can read addresses" ON public.addresses
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Sellers can insert addresses" ON public.addresses;
CREATE POLICY "Sellers can insert addresses" ON public.addresses
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage addresses" ON public.addresses;
CREATE POLICY "Admins can manage addresses" ON public.addresses
    FOR ALL USING (public.is_admin());

-- ORDERS
DROP POLICY IF EXISTS "Sellers can view their own orders" ON public.orders;
CREATE POLICY "Sellers can view their own orders" ON public.orders
    FOR SELECT USING (
        seller_id = auth.uid() OR public.is_admin()
    );

DROP POLICY IF EXISTS "Sellers can insert their own orders" ON public.orders;
CREATE POLICY "Sellers can insert their own orders" ON public.orders
    FOR INSERT WITH CHECK (
        seller_id = auth.uid() AND 
        EXISTS (SELECT 1 FROM public.sellers WHERE id = auth.uid() AND is_active = true)
    );

DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
CREATE POLICY "Admins can update all orders" ON public.orders
    FOR UPDATE USING (public.is_admin());

-- ORDER ITEMS
DROP POLICY IF EXISTS "Sellers can view their own order items" ON public.order_items;
CREATE POLICY "Sellers can view their own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = public.order_items.order_id AND 
            (seller_id = auth.uid() OR public.is_admin())
        )
    );

DROP POLICY IF EXISTS "Sellers can insert their own order items" ON public.order_items;
CREATE POLICY "Sellers can insert their own order items" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE id = public.order_items.order_id AND seller_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can update all order items" ON public.order_items;
CREATE POLICY "Admins can update all order items" ON public.order_items
    FOR UPDATE USING (public.is_admin());

-- COMMISSION PAYOUTS
DROP POLICY IF EXISTS "Sellers can view their own payouts" ON public.commission_payouts;
CREATE POLICY "Sellers can view their own payouts" ON public.commission_payouts
    FOR SELECT USING (
        seller_id = auth.uid() OR public.is_admin()
    );

DROP POLICY IF EXISTS "Admins can manage payouts" ON public.commission_payouts;
CREATE POLICY "Admins can manage payouts" ON public.commission_payouts
    FOR ALL USING (public.is_admin());

-- INVENTORY TRANSACTIONS
DROP POLICY IF EXISTS "Admins can manage inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Admins can manage inventory transactions" ON public.inventory_transactions
    USING (public.is_admin());
