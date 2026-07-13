-- Migration v51: Add route_sheet_id to cash_transactions for logistics costing
-- Execute using run_sql.js

ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS route_sheet_id UUID REFERENCES public.route_sheets(id) ON DELETE SET NULL;
