-- Migration v41: Tarifas de Choferes, Liquidación de Fletes y Vehículos
-- Ejecutar usando run_sql.js

-- 1. Crear tabla de vehículos
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL,
    vehicle_type TEXT NOT NULL,
    plate_number TEXT NOT NULL,
    max_weight_kg NUMERIC,
    max_volume_m3 NUMERIC,
    max_speed_kmh NUMERIC,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS en vehículos
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access on vehicles" ON public.vehicles;
CREATE POLICY "Allow authenticated users full access on vehicles"
ON public.vehicles
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2. Crear tabla de tarifas de fleteros
CREATE TABLE IF NOT EXISTS public.carrier_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_id UUID REFERENCES public.carriers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    daily_rate NUMERIC NOT NULL DEFAULT 0,
    hourly_rate NUMERIC DEFAULT 0,
    overtime_hourly_rate NUMERIC DEFAULT 0,
    assistant_rate NUMERIC DEFAULT 0,
    base_kms NUMERIC NOT NULL DEFAULT 0,
    extra_km_rate NUMERIC NOT NULL DEFAULT 0,
    includes_tolls BOOLEAN DEFAULT true,
    logistics_zone_id UUID REFERENCES public.zones(id) ON DELETE SET NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS en tarifas
ALTER TABLE public.carrier_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access on carrier_rates" ON public.carrier_rates;
CREATE POLICY "Allow authenticated users full access on carrier_rates"
ON public.carrier_rates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Modificaciones en la tabla de hojas de ruta (route_sheets)
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS carrier_rate_id UUID REFERENCES public.carrier_rates(id) ON DELETE SET NULL;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS actual_hours NUMERIC DEFAULT 0;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS actual_overtime_hours NUMERIC DEFAULT 0;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS actual_kms NUMERIC DEFAULT 0;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS has_assistant BOOLEAN DEFAULT false;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS tolls_amount NUMERIC DEFAULT 0;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS carrier_cost_calculated NUMERIC DEFAULT 0;
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS carrier_payout_status TEXT DEFAULT 'Pendiente' CHECK (carrier_payout_status IN ('Pendiente', 'Liquidado'));
ALTER TABLE public.route_sheets ADD COLUMN IF NOT EXISTS carrier_payout_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE SET NULL;
