-- Client writes evaluate the phone indexes with the permissions of the caller.
-- This helper only normalizes the text supplied by the caller.
GRANT EXECUTE ON FUNCTION public.top_customer_phone(text) TO authenticated;
