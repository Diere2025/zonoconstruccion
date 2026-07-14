-- Migration V61: Safety stock settings for suppliers
-- Run using run_sql.js

ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS safety_stock_days INT NOT NULL DEFAULT 7;
