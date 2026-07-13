-- Migration V14: Asignar lunes a sábados (1,2,3,4,5,6) a todos los tipos de entrega de la categoría 'Regular'
UPDATE public.delivery_times 
SET delivery_days = '{1, 2, 3, 4, 5, 6}' 
WHERE category = 'Regular';
