BEGIN;
-- Hide Point QR for new sales; preserve existing payments and their method IDs.
UPDATE public.payment_methods
SET is_active = false, is_default = false
WHERE name ~* '^point\s*qr([[:space:](]|$)';
COMMIT;
