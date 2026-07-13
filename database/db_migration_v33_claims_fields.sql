-- Migration V33: Add whaticket link, specifications, attachments, problem explanation, and notes columns to returns_exchanges
ALTER TABLE public.returns_exchanges 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS whaticket_link TEXT,
ADD COLUMN IF NOT EXISTS specifications TEXT,
ADD COLUMN IF NOT EXISTS attachments TEXT[],
ADD COLUMN IF NOT EXISTS problem_explanation TEXT;
