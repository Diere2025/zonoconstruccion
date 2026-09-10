-- Migration v73: Finanzas transactions performance optimization and indexes
CREATE OR REPLACE FUNCTION public.get_account_balances_prior_to(cutoff_date timestamp with time zone)
RETURNS TABLE(account_id text, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 
  SELECT
    COALESCE(financial_account_id::text, 'cash_register') as account_id,
    COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE -amount END), 0)::numeric as balance
  FROM public.cash_transactions
  WHERE created_at < cutoff_date
  GROUP BY financial_account_id;
;

CREATE INDEX IF NOT EXISTS idx_cash_transactions_created_at ON public.cash_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_financial_account_id ON public.cash_transactions(financial_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_route_sheet_id ON public.cash_transactions(route_sheet_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_cost_center_id ON public.cash_transactions(cost_center_id);
