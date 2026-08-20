-- Migration V61: Clean up old purchase records and expand supplier_purchases table schema
-- Run using run_sql.js

-- 1. Clear old data from purchase-related tables
DELETE FROM public.purchase_reception_items;
DELETE FROM public.purchase_receptions;
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;
DELETE FROM public.supplier_purchase_items;
DELETE FROM public.supplier_purchases;
DELETE FROM public.inventory_transactions WHERE type = 'Compra';

-- 2. Add document_type and link columns to supplier_purchases
ALTER TABLE public.supplier_purchases 
ADD COLUMN IF NOT EXISTS document_type VARCHAR(50) DEFAULT 'Factura' CHECK (document_type IN ('Factura', 'Nota de Crédito', 'Remito')),
ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS purchase_reception_id UUID REFERENCES public.purchase_receptions(id) ON DELETE SET NULL;
