-- Migration v44: Cuentas Financieras Integradas y Flujo de Fondos Gral (Bancos / MP / Efectivo)
-- Ejecutar usando run_sql.js

-- 1. Crear tabla de Cuentas Financieras
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('efectivo', 'banco', 'virtual', 'tarjeta')),
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Seed inicial de Cuentas Financieras
INSERT INTO public.financial_accounts (name, type, currency, is_active) VALUES
('Caja Efectivo Pesos', 'efectivo', 'ARS', true),
('Caja Efectivo Dólares', 'efectivo', 'USD', true),
('Cuenta MP1', 'virtual', 'ARS', true),
('Cuenta MP2', 'virtual', 'ARS', true),
('Cuenta MP 3 y 4', 'virtual', 'ARS', true),
('Cuenta Galicia', 'banco', 'ARS', true),
('Galicia.Mas', 'banco', 'ARS', true),
('Visa.Galicia', 'tarjeta', 'ARS', true),
('Inversiones', 'virtual', 'ARS', true),
('Cuenta Santander', 'banco', 'ARS', true),
('Cuenta ICBC', 'banco', 'ARS', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Modificaciones en la tabla cash_transactions
-- 3a. Hacer register_id opcional (DROP NOT NULL)
ALTER TABLE public.cash_transactions ALTER COLUMN register_id DROP NOT NULL;

-- 3b. Agregar referencia a Cuenta Financiera
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

-- 3c. Agregar columnas de categorización enriquecida
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS sub_category TEXT;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS business_unit TEXT;

-- 4. Modificaciones en cobranzas y pagos para linkear directamente la cuenta
ALTER TABLE public.client_payments ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS financial_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

-- 5. Actualizar la función del trigger para validar caja abierta
-- Permitirá transacciones si register_id es nulo (movimientos bancarios / financieros directos)
CREATE OR REPLACE FUNCTION public.check_cash_register_is_open()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Si no se especifica caja (es movimiento bancario/digital directo), se aprueba
  IF NEW.register_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.cash_registers WHERE id = NEW.register_id;
  IF v_status IS NULL OR v_status != 'Abierta' THEN
    RAISE EXCEPTION 'La caja asociada debe estar Abierta para realizar transacciones.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Habilitar Row Level Security (RLS) para financial_accounts
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view financial accounts" ON public.financial_accounts;
CREATE POLICY "Allow authenticated users to view financial accounts" ON public.financial_accounts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow admins to manage financial accounts" ON public.financial_accounts;
CREATE POLICY "Allow admins to manage financial accounts" ON public.financial_accounts
    FOR ALL USING (public.is_admin());
