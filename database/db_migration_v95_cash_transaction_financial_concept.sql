-- Vincula cada movimiento al concepto financiero que se usó para clasificarlo.
ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS financial_concept_id UUID
  REFERENCES public.financial_concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_transactions_financial_concept_id_idx
  ON public.cash_transactions (financial_concept_id);
