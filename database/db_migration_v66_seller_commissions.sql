-- Migration V66: Tabla de Configuración de Comisiones de Vendedores
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.seller_commission_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Matriz General de Comisiones',
    rules JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.seller_commission_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select seller commission configs" ON public.seller_commission_configs;
CREATE POLICY "Authenticated users can select seller commission configs" ON public.seller_commission_configs
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage seller commission configs" ON public.seller_commission_configs;
CREATE POLICY "Admins can manage seller commission configs" ON public.seller_commission_configs
    FOR ALL USING (public.is_admin());

-- Seed de configuración inicial de matriz de comisiones
INSERT INTO public.seller_commission_configs (name, rules)
VALUES (
    'Matriz General de Comisiones',
    '{
      "tiers": [
        { "min_sales": 25000000 },
        { "min_sales": 32500000 },
        { "min_sales": 40000000 },
        { "min_sales": 50000000 },
        { "min_sales": 60000000 },
        { "min_sales": 70000000 }
      ],
      "category_groups": [
        {
          "id": "group_1",
          "name": "Tanques, Blos, Pinturas",
          "categories": ["Tanques de Agua", "Biodigestores", "Tanques Tricapa Oferta", "Tanques Tricapa Beige", "Cámaras Sépticas", "Tanques Cisterna", "Tanques Bicapa", "Complementos para tanques", "Cámaras Desengrasadoras", "Tanques Cuatricapa", "Pinturas"],
          "rates": [
            { "tier_min_sales": 25000000, "rate_pct": 1.05, "max_amount": 262500 },
            { "tier_min_sales": 32500000, "rate_pct": 1.15, "max_amount": 373750 },
            { "tier_min_sales": 40000000, "rate_pct": 1.25, "max_amount": 500000 },
            { "tier_min_sales": 50000000, "rate_pct": 1.38, "max_amount": 690000 },
            { "tier_min_sales": 60000000, "rate_pct": 1.50, "max_amount": 900000 },
            { "tier_min_sales": 70000000, "rate_pct": 1.60, "max_amount": 1120000 }
          ]
        },
        {
          "id": "group_2",
          "name": "Herramientas, Termotanques, Instalaciones",
          "categories": ["Herramientas", "Termotanques", "Instalaciones", "Caños Termofusión", "MEPS", "Escaleras", "Insumos", "Otros"],
          "rates": [
            { "tier_min_sales": 25000000, "rate_pct": 0.45, "max_amount": 112500 },
            { "tier_min_sales": 32500000, "rate_pct": 0.55, "max_amount": 178750 },
            { "tier_min_sales": 40000000, "rate_pct": 0.65, "max_amount": 260000 },
            { "tier_min_sales": 50000000, "rate_pct": 0.78, "max_amount": 390000 },
            { "tier_min_sales": 60000000, "rate_pct": 0.90, "max_amount": 540000 },
            { "tier_min_sales": 70000000, "rate_pct": 1.00, "max_amount": 700000 }
          ]
        }
      ]
    }'::jsonb
) ON CONFLICT DO NOTHING;
