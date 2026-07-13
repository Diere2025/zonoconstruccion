-- 1. Add is_wholesale column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN DEFAULT FALSE;

-- 2. Drop the existing view
DROP VIEW IF EXISTS v_client_balances_and_stats CASCADE;

-- 3. Create the view with the new column layout
CREATE OR REPLACE VIEW v_client_balances_and_stats AS
 WITH client_orders AS (
         SELECT orders.client_id,
            COALESCE(sum(orders.total_amount), (0)::numeric) AS total_charged,
            count(*) AS orders_count
           FROM orders
          WHERE (orders.status <> 'Anulado'::text)
          GROUP BY orders.client_id
        ), client_payments_sum AS (
         SELECT client_payments.client_id,
            COALESCE(sum((client_payments.amount * COALESCE(client_payments.exchange_rate, (1)::numeric))), (0)::numeric) AS total_paid
           FROM client_payments
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
