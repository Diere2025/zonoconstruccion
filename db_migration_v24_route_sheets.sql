-- Create route_sheets table
CREATE TABLE IF NOT EXISTS route_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  run_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Borrador', -- 'Borrador', 'En Viaje', 'Cerrada'
  total_theoretical_cash NUMERIC NOT NULL DEFAULT 0,
  total_reconciled_cash NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_carrier_date_run UNIQUE (carrier_id, delivery_date, run_number)
);

-- Add route_sheet_id to deliveries
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS route_sheet_id UUID REFERENCES route_sheets(id) ON DELETE SET NULL;

-- Add status and route_sheet_id columns to client_payments
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Aprobado';
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS route_sheet_id UUID REFERENCES route_sheets(id) ON DELETE SET NULL;

-- Recreate view v_client_balances_and_stats to filter approved payments
DROP VIEW IF EXISTS v_client_balances_and_stats CASCADE;

CREATE OR REPLACE VIEW v_client_balances_and_stats AS
 WITH client_orders AS (
         SELECT orders.client_id,
            COALESCE(sum(orders.total_amount), (0)::numeric) AS total_charged,
            count(*) AS orders_count
           FROM orders
          WHERE (orders.status <> 'Anulado'::text) AND (orders.status <> 'Cancelado'::text)
          GROUP BY orders.client_id
        ), client_payments_sum AS (
         SELECT client_payments.client_id,
            COALESCE(sum((client_payments.amount * COALESCE(client_payments.exchange_rate, (1)::numeric))), (0)::numeric) AS total_paid
           FROM client_payments
          WHERE (client_payments.status = 'Aprobado')
          GROUP BY client_payments.client_id
        )
 SELECT c.id,
    c.internal_code,
    c.code,
    c.business_name,
    c.aliases,
    c.phone_primary,
    c.phone_secondary,
    c.tax_id,
    c.billing_address,
    c.credit_limit,
    c.created_at,
    c.email,
    c.is_wholesale,
    COALESCE(o.total_charged, (0)::numeric) AS total_charged,
    COALESCE(p.total_paid, (0)::numeric) AS total_paid,
    (COALESCE(o.total_charged, (0)::numeric) - COALESCE(p.total_paid, (0)::numeric)) AS balance,
    (COALESCE(o.orders_count, (0)::bigint))::integer AS orders_count
   FROM ((clients c
     LEFT JOIN client_orders o ON ((c.id = o.client_id)))
     LEFT JOIN client_payments_sum p ON ((c.id = p.client_id)));
