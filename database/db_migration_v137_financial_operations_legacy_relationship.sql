begin;

-- A composite PK of both foreign keys makes PostgREST infer a second,
-- many-to-many payment -> purchase relationship. Older deployed readers use
-- supplier_purchases(...) without a FK hint and must keep their original meaning.
-- Use an independent PK while retaining the exact unique allocation pair.
alter table public.supplier_payment_allocations
  add column if not exists id uuid not null default gen_random_uuid();

do $$
declare v_pk text; v_columns text[];
begin
  select c.conname, array_agg(a.attname::text order by k.ordinality)
    into v_pk, v_columns
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality)
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
  where c.conrelid='public.supplier_payment_allocations'::regclass and c.contype='p'
  group by c.conname;
  if v_columns=array['payment_id','purchase_id']::text[] then
    alter table public.supplier_payment_allocations
      add constraint supplier_payment_allocations_pair_key unique(payment_id,purchase_id);
    execute format('alter table public.supplier_payment_allocations drop constraint %I',v_pk);
    alter table public.supplier_payment_allocations
      add constraint supplier_payment_allocations_pkey primary key(id);
  elsif v_columns is distinct from array['id']::text[] then
    raise exception 'Unexpected allocation primary key; compatibility migration stopped';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
