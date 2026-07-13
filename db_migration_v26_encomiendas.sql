-- Create Sequence for Encomiendas code
CREATE SEQUENCE IF NOT EXISTS public.encomiendas_code_seq START WITH 529;

-- Create Encomiendas Table
CREATE TABLE IF NOT EXISTS public.encomiendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  type text NOT NULL, -- 'llevar_pago', 'buscar_mercaderia', 'buscar_insumos', 'tramite_general', 'otro'
  client_name text,
  client_phone text,
  description text NOT NULL,
  locality text NOT NULL,
  address text NOT NULL,
  google_maps_link text,
  purchase_order_id uuid REFERENCES public.supplier_purchases(id) ON DELETE SET NULL,
  invoice_number text,
  notes text,
  delivery_date date NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Trigger to set Encomiendas sequential code
CREATE OR REPLACE FUNCTION public.set_encomiendas_code()
RETURNS trigger AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'ENC' || nextval('public.encomiendas_code_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_encomiendas_code ON public.encomiendas;
CREATE TRIGGER trigger_encomiendas_code
BEFORE INSERT ON public.encomiendas
FOR EACH ROW
EXECUTE FUNCTION public.set_encomiendas_code();

-- Alter deliveries table to make order_id nullable and add encomienda_id
ALTER TABLE public.deliveries ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS encomienda_id uuid REFERENCES public.encomiendas(id) ON DELETE CASCADE;

-- Add CHECK constraint to ensure either order_id or encomienda_id is set
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS check_delivery_target;
ALTER TABLE public.deliveries ADD CONSTRAINT check_delivery_target CHECK (
  (order_id IS NOT NULL AND encomienda_id IS NULL) OR 
  (order_id IS NULL AND encomienda_id IS NOT NULL)
);

-- Unique index to prevent duplicate deliveries for same encomienda
DROP INDEX IF EXISTS public.deliveries_encomienda_id_key;
CREATE UNIQUE INDEX deliveries_encomienda_id_key ON public.deliveries(encomienda_id) WHERE encomienda_id IS NOT NULL;

-- Trigger to auto-create delivery stop on encomienda creation
CREATE OR REPLACE FUNCTION public.on_encomienda_created_create_delivery()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.deliveries (encomienda_id, delivery_date, status)
  VALUES (NEW.id, NEW.delivery_date, 'pendiente_ruteo')
  ON CONFLICT (encomienda_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_encomienda_created ON public.encomiendas;
CREATE TRIGGER trigger_encomienda_created
AFTER INSERT ON public.encomiendas
FOR EACH ROW
EXECUTE FUNCTION public.on_encomienda_created_create_delivery();

-- Enable RLS and create policy for authenticated users
ALTER TABLE public.encomiendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access on encomiendas" ON public.encomiendas;
CREATE POLICY "Allow authenticated users full access on encomiendas"
ON public.encomiendas
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
