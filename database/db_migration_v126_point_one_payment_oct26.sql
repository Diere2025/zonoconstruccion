BEGIN;
INSERT INTO public.payment_methods(id,name,surcharge_percentage,installments,is_active,is_default)
SELECT gen_random_uuid(),'Point 1 Pago (oct26)',7,1,true,false
WHERE NOT EXISTS(SELECT 1 FROM public.payment_methods WHERE name='Point 1 Pago (oct26)');
UPDATE public.payment_methods SET surcharge_percentage=7,installments=1,is_active=true,is_default=false
WHERE name='Point 1 Pago (oct26)';
COMMIT;
