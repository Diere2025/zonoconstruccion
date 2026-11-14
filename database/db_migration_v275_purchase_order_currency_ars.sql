begin;

alter table public.purchase_orders alter column currency set default 'ARS';

update public.purchase_orders
set currency = 'ARS'
where currency is null;

alter table public.purchase_orders alter column currency set not null;

commit;
