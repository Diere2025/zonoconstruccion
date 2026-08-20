-- Migration V39: Enable core order mediums and disable redundant line-specific ones
UPDATE public.order_mediums SET is_active = true, requires_phone_line = true WHERE name = 'WhatsApp';
UPDATE public.order_mediums SET is_active = true, requires_phone_line = true WHERE name = 'Llamado';
UPDATE public.order_mediums SET is_active = true, requires_phone_line = true WHERE name = 'Whaticket';

UPDATE public.order_mediums 
SET is_active = false 
WHERE name IN ('Llamado 3690', 'Llamado 3881', 'WhatsApp 3690', 'WhatsApp 3881', 'WP Mayorista 3375');
