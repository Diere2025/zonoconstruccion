begin;
alter table public.logistics_carrier_tariffs add column if not exists supersedes_tariff_id uuid references public.logistics_carrier_tariffs(id);
create unique index if not exists logistics_tariff_single_revision on public.logistics_carrier_tariffs(supersedes_tariff_id) where supersedes_tariff_id is not null;
commit;
