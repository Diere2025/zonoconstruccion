-- Migration V17: Gestión de Cajas, Pagos, Cuentas Corrientes y Postventa ERP
-- Ejecutar en el SQL Editor de Supabase o mediante run_sql.js

-- =========================================================================
-- 1. Tablas de Tesorería (Cajas Diarias)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opened_by UUID NOT NULL REFERENCES auth.users(id),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    closed_by UUID REFERENCES auth.users(id),
    closed_at TIMESTAMP WITH TIME ZONE,
    initial_balance_ars NUMERIC NOT NULL DEFAULT 0,
    expected_balance_ars NUMERIC NOT NULL DEFAULT 0,
    actual_balance_ars NUMERIC,
    initial_balance_usd NUMERIC NOT NULL DEFAULT 0,
    expected_balance_usd NUMERIC NOT NULL DEFAULT 0,
    actual_balance_usd NUMERIC,
    status TEXT DEFAULT 'Abierta' CHECK (status IN ('Abierta', 'Cerrada')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.cash_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
    category TEXT NOT NULL CHECK (category IN ('cobro_pedido', 'pago_proveedor', 'retiro_caja', 'ingreso_capital', 'gasto_general', 'ajuste_arqueo', 'devolucion_reembolso')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
    exchange_rate NUMERIC DEFAULT 1.0,
    payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id),
    reference_id UUID, -- ID genérico (pedido, pago a cuenta, compra, devolución)
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =========================================================================
-- 2. Cuentas Corrientes y Finanzas (Clientes y Proveedores)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL, -- Positivo: Cobranza. Negativo: Saldo a favor por devolución.
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
    exchange_rate NUMERIC DEFAULT 1.0,
    payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id),
    cash_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
    receipt_url TEXT,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.supplier_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    due_date TIMESTAMP WITH TIME ZONE,
    total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
    status TEXT DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Parcial', 'Pagado', 'Anulado')),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.supplier_purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.supplier_purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    purchase_id UUID REFERENCES public.supplier_purchases(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
    payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id),
    cash_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.product_cost_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    purchase_id UUID NOT NULL REFERENCES public.supplier_purchases(id) ON DELETE CASCADE,
    catalog_cost NUMERIC NOT NULL,
    purchase_cost NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Ignorada', 'Actualizada')),
    created_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =========================================================================
-- 3. Módulo de Postventa (Cambios, Devoluciones y Garantías)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.returns_exchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK (type IN ('devolucion', 'cambio', 'garantia')),
    status TEXT DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Aprobado', 'Rechazado', 'Completado')),
    reason TEXT NOT NULL,
    refund_amount NUMERIC DEFAULT 0,
    exchange_amount NUMERIC DEFAULT 0,
    difference_amount NUMERIC DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES public.returns_exchanges(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    restock_action TEXT NOT NULL CHECK (restock_action IN ('reingreso_stock', 'descarte_defectuoso'))
);

CREATE TABLE IF NOT EXISTS public.exchange_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES public.returns_exchanges(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS public.warranty_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES public.returns_exchanges(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    serial_number TEXT,
    issue_description TEXT NOT NULL,
    customer_resolution TEXT DEFAULT 'pendiente' CHECK (customer_resolution IN ('pendiente', 'reemplazo_entregado', 'nota_credito_emitida', 'rechazado')),
    supplier_claim_status TEXT DEFAULT 'no_reclamado' CHECK (supplier_claim_status IN ('no_reclamado', 'enviado_a_fabrica', 'aprobado_por_proveedor', 'rechazado_por_proveedor')),
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =========================================================================
-- 4. Habilitación de Row Level Security (RLS)
-- =========================================================================

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 5. Declaración de Políticas RLS
-- =========================================================================

-- Cajas
DROP POLICY IF EXISTS "Authenticated users can select cash registers" ON public.cash_registers;
CREATE POLICY "Authenticated users can select cash registers" ON public.cash_registers
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert/update cash registers" ON public.cash_registers;
CREATE POLICY "Authenticated users can insert/update cash registers" ON public.cash_registers
    FOR ALL USING (auth.role() = 'authenticated');

-- Transacciones de Caja
DROP POLICY IF EXISTS "Authenticated users can select transactions" ON public.cash_transactions;
CREATE POLICY "Authenticated users can select transactions" ON public.cash_transactions
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.cash_transactions;
CREATE POLICY "Authenticated users can insert transactions" ON public.cash_transactions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can update/delete transactions" ON public.cash_transactions;
CREATE POLICY "Admins can update/delete transactions" ON public.cash_transactions
    FOR ALL USING (public.is_admin());

-- Cobranzas Clientes
DROP POLICY IF EXISTS "Authenticated users can select client payments" ON public.client_payments;
CREATE POLICY "Authenticated users can select client payments" ON public.client_payments
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert client payments" ON public.client_payments;
CREATE POLICY "Authenticated users can insert client payments" ON public.client_payments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage client payments" ON public.client_payments;
CREATE POLICY "Admins can manage client payments" ON public.client_payments
    FOR ALL USING (public.is_admin());

-- Compras, Ítems, Órdenes de Pago y Alertas a Proveedores
-- Lectura permitida a todos los autenticados para control de stock/alertas, escritura solo a administradores.
DROP POLICY IF EXISTS "Authenticated users can select supplier purchases" ON public.supplier_purchases;
CREATE POLICY "Authenticated users can select supplier purchases" ON public.supplier_purchases
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage supplier purchases" ON public.supplier_purchases;
CREATE POLICY "Admins can manage supplier purchases" ON public.supplier_purchases
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can select supplier purchase items" ON public.supplier_purchase_items;
CREATE POLICY "Authenticated users can select supplier purchase items" ON public.supplier_purchase_items
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage supplier purchase items" ON public.supplier_purchase_items;
CREATE POLICY "Admins can manage supplier purchase items" ON public.supplier_purchase_items
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can select supplier payments" ON public.supplier_payments;
CREATE POLICY "Authenticated users can select supplier payments" ON public.supplier_payments
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage supplier payments" ON public.supplier_payments;
CREATE POLICY "Admins can manage supplier payments" ON public.supplier_payments
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can select product cost alerts" ON public.product_cost_alerts;
CREATE POLICY "Authenticated users can select product cost alerts" ON public.product_cost_alerts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage product cost alerts" ON public.product_cost_alerts;
CREATE POLICY "Admins can manage product cost alerts" ON public.product_cost_alerts
    FOR ALL USING (public.is_admin());

-- Devoluciones, Ítems de cambio y Garantías (Fuerza de venta puede gestionar postventa)
DROP POLICY IF EXISTS "Authenticated users can select returns" ON public.returns_exchanges;
CREATE POLICY "Authenticated users can select returns" ON public.returns_exchanges
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage returns" ON public.returns_exchanges;
CREATE POLICY "Authenticated users can manage returns" ON public.returns_exchanges
    FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can select return items" ON public.return_items;
CREATE POLICY "Authenticated users can select return items" ON public.return_items
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage return items" ON public.return_items;
CREATE POLICY "Authenticated users can manage return items" ON public.return_items
    FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can select exchange items" ON public.exchange_items;
CREATE POLICY "Authenticated users can select exchange items" ON public.exchange_items
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage exchange items" ON public.exchange_items;
CREATE POLICY "Authenticated users can manage exchange items" ON public.exchange_items
    FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can select warranty claims" ON public.warranty_claims;
CREATE POLICY "Authenticated users can select warranty claims" ON public.warranty_claims
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage warranty claims" ON public.warranty_claims;
CREATE POLICY "Authenticated users can manage warranty claims" ON public.warranty_claims
    FOR ALL USING (auth.role() = 'authenticated');

-- =========================================================================
-- 6. Triggers y Funciones de Base de Datos
-- =========================================================================

-- 6a. Validar que la caja esté abierta para transacciones
CREATE OR REPLACE FUNCTION public.check_cash_register_is_open()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.cash_registers WHERE id = NEW.register_id;
  IF v_status IS NULL OR v_status != 'Abierta' THEN
    RAISE EXCEPTION 'La caja asociada debe estar Abierta para realizar transacciones.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cash_transaction_check_register ON public.cash_transactions;
CREATE TRIGGER trg_cash_transaction_check_register
BEFORE INSERT OR UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.check_cash_register_is_open();


-- 6b. Obtener costo de catálogo de un producto
CREATE OR REPLACE FUNCTION public.get_product_catalog_cost(p_product_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_sku TEXT;
  v_supplier_id UUID;
  v_cost NUMERIC;
BEGIN
  -- Obtener SKU y proveedor primario del producto
  SELECT sku INTO v_sku FROM public.products WHERE id = p_product_id;
  SELECT supplier_id INTO v_supplier_id 
    FROM public.product_supplier_relations 
    WHERE product_id = p_product_id AND is_primary = true 
    LIMIT 1;

  IF v_supplier_id IS NULL THEN
    SELECT supplier_id INTO v_supplier_id 
      FROM public.product_supplier_relations 
      WHERE product_id = p_product_id 
      LIMIT 1;
  END IF;

  IF v_sku IS NULL OR v_supplier_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Buscar en los ítems de lista activos del proveedor
  SELECT pli.final_cost INTO v_cost
    FROM public.price_list_items pli
    JOIN public.price_lists pl ON pl.id = pli.price_list_id
    WHERE pl.supplier_id = v_supplier_id AND pl.is_active = true AND pli.sku = v_sku
    LIMIT 1;

  RETURN COALESCE(v_cost, 0);
END;
$$ LANGUAGE plpgsql;


-- 6c. Generar alertas de discrepancias de costos al registrar compras
CREATE OR REPLACE FUNCTION public.check_supplier_purchase_cost_discrepancy()
RETURNS TRIGGER AS $$
DECLARE
  v_catalog_cost NUMERIC;
  v_purchase_created_by UUID;
BEGIN
  -- Obtener costo del catálogo actual
  v_catalog_cost := public.get_product_catalog_cost(NEW.product_id);
  
  -- Obtener usuario creador del remito/factura de compra
  SELECT created_by INTO v_purchase_created_by 
    FROM public.supplier_purchases 
    WHERE id = NEW.purchase_id;

  -- Crear alerta si el costo es diferente y el costo de catálogo es mayor a 0
  IF v_catalog_cost > 0 AND v_catalog_cost != NEW.unit_cost THEN
    INSERT INTO public.product_cost_alerts (
      product_id,
      purchase_id,
      catalog_cost,
      purchase_cost,
      status,
      created_by
    ) VALUES (
      NEW.product_id,
      NEW.purchase_id,
      v_catalog_cost,
      NEW.unit_cost,
      'Pendiente',
      v_purchase_created_by
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_purchase_item_cost_check ON public.supplier_purchase_items;
CREATE TRIGGER trg_supplier_purchase_item_cost_check
AFTER INSERT ON public.supplier_purchase_items
FOR EACH ROW EXECUTE FUNCTION public.check_supplier_purchase_cost_discrepancy();


-- 6d. Reingresar stock por devoluciones a stock físico/actual
CREATE OR REPLACE FUNCTION public.process_return_item_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT created_by INTO v_user_id 
    FROM public.returns_exchanges 
    WHERE id = NEW.return_id;

  IF NEW.restock_action = 'reingreso_stock' THEN
    INSERT INTO public.inventory_transactions (
      product_id,
      quantity,
      type,
      reference_id,
      user_id
    ) VALUES (
      NEW.product_id,
      NEW.quantity, -- Cantidad positiva incrementa stock
      'Ajuste',
      NEW.return_id,
      v_user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_return_item_inventory ON public.return_items;
CREATE TRIGGER trg_return_item_inventory
AFTER INSERT ON public.return_items
FOR EACH ROW EXECUTE FUNCTION public.process_return_item_inventory();


-- 6e. Descontar stock por ítems de cambio entregados
CREATE OR REPLACE FUNCTION public.process_exchange_item_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT created_by INTO v_user_id 
    FROM public.returns_exchanges 
    WHERE id = NEW.return_id;

  INSERT INTO public.inventory_transactions (
    product_id,
    quantity,
    type,
    reference_id,
    user_id
  ) VALUES (
    NEW.product_id,
    -NEW.quantity, -- Cantidad negativa decrementa stock
    'Ajuste',
    NEW.return_id,
    v_user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exchange_item_inventory ON public.exchange_items;
CREATE TRIGGER trg_exchange_item_inventory
AFTER INSERT ON public.exchange_items
FOR EACH ROW EXECUTE FUNCTION public.process_exchange_item_inventory();
