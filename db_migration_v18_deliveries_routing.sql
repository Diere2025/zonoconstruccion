-- Migration V18: Ruteo de Entregas, Centros de Costo y Transacciones de Caja Enriquecidas
-- Ejecutar usando run_sql.js

-- A. Tabla de Centros de Costo
CREATE TABLE IF NOT EXISTS public.cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS en Centros de Costo
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select cost centers" ON public.cost_centers;
CREATE POLICY "Authenticated users can select cost centers" ON public.cost_centers
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage cost centers" ON public.cost_centers;
CREATE POLICY "Admins can manage cost centers" ON public.cost_centers
    FOR ALL USING (public.is_admin());

-- B. Tablas de Logística (Transportistas y Ruteo)
CREATE TABLE IF NOT EXISTS public.carriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    vehicle_description TEXT,
    plate_number TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL,
    delivery_date DATE NOT NULL,
    run_number INTEGER NOT NULL DEFAULT 1,
    delivery_order INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pendiente_ruteo' CHECK (status IN ('pendiente_ruteo', 'ruteado', 'en_recorrido', 'entregado', 'fallido')),
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS en logística
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select carriers" ON public.carriers;
CREATE POLICY "Authenticated users can select carriers" ON public.carriers
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage carriers" ON public.carriers;
CREATE POLICY "Authenticated users can manage carriers" ON public.carriers
    FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can select deliveries" ON public.deliveries;
CREATE POLICY "Authenticated users can select deliveries" ON public.deliveries
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage deliveries" ON public.deliveries;
CREATE POLICY "Authenticated users can manage deliveries" ON public.deliveries
    FOR ALL USING (auth.role() = 'authenticated');

-- C. Modificaciones en Tesorería y Compras
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS concept TEXT;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_purchases ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL;

-- D. Triggers y Funciones de Ruteo
-- Trigger para crear entrega pendiente automáticamente al insertar un pedido
CREATE OR REPLACE FUNCTION public.on_order_created_create_delivery()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.deliveries (order_id, delivery_date, status)
  VALUES (NEW.id, NEW.initial_delivery_date, 'pendiente_ruteo')
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_on_order_created_create_delivery ON public.orders;
CREATE TRIGGER trigger_on_order_created_create_delivery
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.on_order_created_create_delivery();

-- E. Inicialización de Datos (Seeds)
-- Inicializar entregas para pedidos existentes
INSERT INTO public.deliveries (order_id, delivery_date, status)
SELECT id, initial_delivery_date, 'pendiente_ruteo'
FROM public.orders
ON CONFLICT (order_id) DO NOTHING;

-- Seed de Centros de Costo estándar
INSERT INTO public.cost_centers (name, code, description) VALUES
('Administración General', 'ADM', 'Gastos administrativos de oficina y central'),
('Logística y Envíos', 'LOG', 'Gastos de distribución, fletes, choferes y camiones'),
('Comercial y Ventas', 'VTA', 'Gastos de marketing, publicidad y comisiones de venta'),
('Soporte y Sistemas', 'SYS', 'Gastos de infraestructura en la nube, WhatsTicket, hosting y soporte IT'),
('Sucursales y Depósito', 'DEP', 'Gastos de depósitos, servicios básicos (luz/agua) y limpieza'),
('Financiero y Bancos', 'FIN', 'Gastos bancarios, intereses, comisiones de pago e impuestos')
ON CONFLICT (code) DO NOTHING;

-- Seed de Transportistas de prueba
INSERT INTO public.carriers (name, vehicle_description, plate_number, phone)
VALUES 
('Chofer Propio Camión 1', 'Mercedes Benz Accelo - 10TN', 'AAA123BB', '3794112233'),
('Furgón Reparto Chico 2', 'Peugeot Partner Blanca', 'CCC456DD', '3794445566'),
('Logística Tercerizada', 'Fletes Express Chaco-Corrientes', 'FLET-999', '3794778899')
ON CONFLICT DO NOTHING;
