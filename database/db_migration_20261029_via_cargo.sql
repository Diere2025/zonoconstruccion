-- Destinations retain the existing addresses permissions. Order snapshots remain immutable.
begin;
alter table public.addresses add column if not exists postal_code text;
alter table public.addresses add column if not exists via_cargo jsonb;
comment on column public.addresses.via_cargo is 'Reusable final recipient destination for Via Cargo, separate from the logistics dispatch address';
notify pgrst, 'reload schema';
commit;
