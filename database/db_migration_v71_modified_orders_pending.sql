-- "Modificado" es exclusivamente una marca operativa de Google Sheets.
-- No modificar snapshots históricos ni pedidos en otros estados.
UPDATE public.orders
SET status = 'Pendiente'
WHERE status = 'Modificado';
