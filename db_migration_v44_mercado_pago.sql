-- ==============================================================================
-- Migration v44: Mercado Pago Payments & Accounts System (Tasker / Realtime)
-- ==============================================================================

-- 1. Create MP Accounts table
CREATE TABLE IF NOT EXISTS mp_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT,
  color TEXT DEFAULT '#0069ff',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Accounts
INSERT INTO mp_accounts (id, name, alias, color) VALUES
  ('acc_principal', 'Cuenta Principal', 'Zono Construcción', '#0069ff'),
  ('acc_secundaria', 'Cuenta Secundaria', 'AquaFort / Zono', '#10b981')
ON CONFLICT (id) DO NOTHING;

-- 2. Create MP Payments table
CREATE TABLE IF NOT EXISTS mp_payments (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES mp_accounts(id) ON DELETE SET NULL,
  account_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  formatted_amount TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  payment_type TEXT NOT NULL, -- 'TRANSFERENCIA', 'QR', 'POINT', 'OTRO'
  source TEXT NOT NULL,       -- 'NOTIFICATION', 'SIMULATION', 'MANUAL'
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_title TEXT,
  raw_body TEXT,
  is_verified BOOLEAN DEFAULT true,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL, -- Link directly to ERP Order
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for high performance querying
CREATE INDEX IF NOT EXISTS idx_mp_payments_received_at ON mp_payments(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_payments_account_id ON mp_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_order_id ON mp_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_payer ON mp_payments USING gin(to_tsvector('spanish', payer_name));

-- 4. Enable Supabase Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'mp_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mp_payments;
  END IF;
END $$;

-- 5. Row Level Security Policies
ALTER TABLE mp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of mp_accounts" ON mp_accounts FOR SELECT USING (true);
CREATE POLICY "Allow admin full access to mp_accounts" ON mp_accounts FOR ALL USING (true);

CREATE POLICY "Allow authenticated read of mp_payments" ON mp_payments FOR SELECT USING (true);
CREATE POLICY "Allow service role and admin insert mp_payments" ON mp_payments FOR ALL USING (true);
