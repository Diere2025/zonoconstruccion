begin;

create temporary table carrier_merge_map (
  source_id uuid primary key,
  target_id uuid not null,
  target_name text not null
) on commit drop;

insert into carrier_merge_map (source_id, target_id, target_name) values
  -- Conserva el registro más antiguo para los duplicados sin movimientos.
  ('66e07099-9615-40b1-acb6-c491bb3d7eee', '60b83202-8de3-4226-bb15-d38161680632', 'Furgón Reparto Chico 2'),
  ('151646ba-933d-411a-b0cd-272c7654bec6', '71155b6d-cb51-4c68-b8bc-e99ba9df7509', 'Logística Tercerizada'),
  -- Conserva el nombre completo del transportista.
  ('1dc33227-b602-42ad-a4b9-efc4da0291b0', '26e7ce90-49ae-4dde-8c6d-9155db549af8', 'Pablo Damián Lavayen'),
  ('18a7e640-7f8b-4e4a-82ee-d9f03d27e28f', '9945004e-8408-4d2d-886a-ae0d5dc17cda', 'Esteban Jorge Ramallo'),
  ('5d4c66a3-f5c2-4008-92b8-390776f8f4b1', '18283e63-1e67-402d-8823-bc422a810ee6', 'Sergio Radice');

update public.carrier_rates r set carrier_id = m.target_id from carrier_merge_map m where r.carrier_id = m.source_id;
update public.deliveries d set carrier_id = m.target_id from carrier_merge_map m where d.carrier_id = m.source_id;
update public.route_sheets r set carrier_id = m.target_id from carrier_merge_map m where r.carrier_id = m.source_id;
update public.vehicles v set carrier_id = m.target_id from carrier_merge_map m where v.carrier_id = m.source_id;
update public.treasury_settlements s set carrier_id = m.target_id, carrier_name = m.target_name from carrier_merge_map m where s.carrier_id = m.source_id;

update public.carriers c set is_active = false from carrier_merge_map m where c.id = m.source_id;

notify pgrst, 'reload schema';
commit;
