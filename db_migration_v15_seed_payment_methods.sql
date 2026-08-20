-- Migration V15: Seed standard payment methods in Supabase
-- Insertar métodos de pago estándar si no existen para evitar errores FK al crear pedidos

INSERT INTO public.payment_methods (id, name, surcharge_percentage, installments, is_active)
VALUES 
  ('a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3', 'Efectivo / Transferencia', 0, 1, true),
  ('e885c35b-1175-4702-8692-75d1f8f3c7b3', 'Tarjeta de Crédito', 0, 1, true)
ON CONFLICT (id) DO NOTHING;
