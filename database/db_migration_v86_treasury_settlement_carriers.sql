begin;

alter table public.treasury_settlements
  add column if not exists carrier_id uuid references public.carriers(id) on delete set null;

create index if not exists idx_treasury_settlements_carrier_date
  on public.treasury_settlements(carrier_id, settlement_date desc);

-- Vincula los nombres importados que coinciden inequívocamente con un transportista.
update public.treasury_settlements s
set carrier_id = c.id,
    carrier_name = c.name
from public.carriers c
where s.carrier_id is null
  and (
    (lower(s.carrier_name) like '%jorge%' and lower(s.carrier_name) like '%salcedo%' and c.name = 'Jorge Salcedo')
    or (lower(s.carrier_name) like '%jorge%' and lower(s.carrier_name) like '%ramallo%' and c.name = 'Jorge Ramallo')
    or (lower(s.carrier_name) like '%pablo%' and lower(s.carrier_name) like '%lavayen%' and c.name = 'Pablo Lavayen')
    or (lower(s.carrier_name) like '%diego%' and lower(s.carrier_name) like '%weis%' and c.name = 'Diego Weis')
    or (lower(s.carrier_name) like '%gyv%' and c.name = 'GYV')
  );

notify pgrst, 'reload schema';
commit;
