-- Migration v46: Crear tabla de empleados y enlazar liquidación de sueldos (nómina)
-- Ejecutar usando run_sql.js

-- 1. Crear tabla de Empleados
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    cuit TEXT,
    role TEXT,
    base_salary NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Habilitar RLS en public.employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view employees" ON public.employees;
CREATE POLICY "Allow authenticated users to view employees" ON public.employees
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow admins to manage employees" ON public.employees;
CREATE POLICY "Allow admins to manage employees" ON public.employees
    FOR ALL USING (public.is_admin());

-- 3. Agregar referencia a Empleados en cash_transactions
ALTER TABLE public.cash_transactions 
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

-- 4. Crear índice para optimizar búsquedas por empleado
CREATE INDEX IF NOT EXISTS idx_cash_transactions_employee_id ON public.cash_transactions(employee_id);
