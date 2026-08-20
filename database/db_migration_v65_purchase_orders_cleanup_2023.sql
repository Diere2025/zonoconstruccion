-- Migration V65: Clean up old purchase orders and receptions prior to OP002408
-- Run using run_sql or directly in Supabase

BEGIN;

-- 1. Delete purchase receptions linked to purchase orders below OP002408
-- This automatically cascade-deletes their purchase_reception_items
DELETE FROM public.purchase_receptions
WHERE purchase_order_id IN (
  SELECT id 
  FROM public.purchase_orders 
  WHERE substring(oc_code from '\\d+')::integer < 2408
);

-- 2. Delete orphaned purchase receptions from 2023 (i.e. those with no purchase_order_id and dated in 2023)
-- This automatically cascade-deletes their purchase_reception_items
DELETE FROM public.purchase_receptions
WHERE purchase_order_id IS NULL 
  AND reception_date < '2025-01-01';

-- 3. Delete purchase orders below OP002408
-- This automatically cascade-deletes their purchase_order_items
DELETE FROM public.purchase_orders
WHERE substring(oc_code from '\\d+')::integer < 2408;

COMMIT;
