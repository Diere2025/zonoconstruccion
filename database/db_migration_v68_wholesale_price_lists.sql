-- Migration V68: Wholesale Price Lists (Listas de Precios de Venta Mayorista)
-- Permite persistir y versionar las listas de precios oficiales para venta a Corralones, Ferreterías y Distribuidores

-- 1. Tabla de Listas de Precios Mayoristas
CREATE TABLE IF NOT EXISTS public.wholesale_price_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_number TEXT NOT NULL UNIQUE, -- ej: "13"
    name TEXT NOT NULL, -- ej: "Lista 13 Mayorista"
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_text TEXT DEFAULT 'Septiembre 2026',
    is_active BOOLEAN DEFAULT true,
    global_freight_pct NUMERIC DEFAULT 10.0,
    global_margin_dist_pct NUMERIC DEFAULT 10.0,
    global_discount_corralon_pct NUMERIC DEFAULT 8.0,
    global_discount_dist_pct NUMERIC DEFAULT 14.0,
    category_configs JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tabla de Ítems de la Lista Mayorista
CREATE TABLE IF NOT EXISTS public.wholesale_price_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id UUID REFERENCES public.wholesale_price_lists(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL, -- id / slug
    product_name TEXT NOT NULL, -- Nombre normalizado
    category TEXT NOT NULL,
    family TEXT,
    liters TEXT,
    is_manufactured BOOLEAN DEFAULT false,
    cost_base_real NUMERIC DEFAULT 0,
    price_list NUMERIC NOT NULL DEFAULT 0, -- Precio Lista (3-9 u)
    price_corralon NUMERIC NOT NULL DEFAULT 0, -- Precio Corralón (10-19 u)
    price_distributor NUMERIC NOT NULL DEFAULT 0, -- Precio Distribuidor (20+ u)
    is_commercialized BOOLEAN DEFAULT true,
    is_confirmed BOOLEAN DEFAULT true,
    override_mode TEXT DEFAULT 'auto',
    custom_fixed_list_price NUMERIC,
    custom_margin_dist_pct NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(price_list_id, product_id)
);

-- 3. Índices para consultas de alta velocidad en cotizaciones
CREATE INDEX IF NOT EXISTS idx_wholesale_price_lists_active ON public.wholesale_price_lists(is_active);
CREATE INDEX IF NOT EXISTS idx_wholesale_price_list_items_list ON public.wholesale_price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_price_list_items_product ON public.wholesale_price_list_items(product_name);
