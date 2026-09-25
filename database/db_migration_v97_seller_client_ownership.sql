begin;

alter table public.clients
  add column if not exists owner_seller_id uuid references public.sellers(id) on delete set null;

create index if not exists idx_clients_owner_seller_id
  on public.clients(owner_seller_id) where is_wholesale is true;

create or replace function public.assign_client_owner_on_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.owner_seller_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists assign_client_owner_on_insert on public.clients;
create trigger assign_client_owner_on_insert
before insert on public.clients for each row execute function public.assign_client_owner_on_insert();

-- Anabel sees only the wholesale accounts assigned to her. Retail lookup stays
-- available so an exact existing phone can be reused without duplicating a client.
drop policy if exists "Everyone authenticated can read clients" on public.clients;
create policy "Authenticated can read permitted clients" on public.clients
for select to authenticated using (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or is_wholesale is not true
  or owner_seller_id = auth.uid()
);

-- Address rows are queried separately from clients, so the client policy alone
-- does not hide another seller's wholesale addresses.
create policy "Anabel can read permitted addresses" on public.addresses
as restrictive for select to authenticated using (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or exists (
    select 1 from public.clients c
    where c.id = client_id
      and (c.is_wholesale is not true or c.owner_seller_id = auth.uid())
  )
);
create policy "Anabel can add permitted addresses" on public.addresses
as restrictive for insert to authenticated with check (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or exists (
    select 1 from public.clients c
    where c.id = client_id
      and (c.is_wholesale is not true or c.owner_seller_id = auth.uid())
  )
);

create policy "Anabel orders use permitted clients" on public.orders
as restrictive for insert to authenticated with check (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or client_id is null
  or exists (
    select 1 from public.clients c
    where c.id = client_id
      and (c.is_wholesale is not true or c.owner_seller_id = auth.uid())
  )
);
create policy "Anabel updates use permitted clients" on public.orders
as restrictive for update to authenticated using (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or seller_id = auth.uid()
) with check (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or (seller_id = auth.uid() and (
    client_id is null
    or exists (
      select 1 from public.clients c
      where c.id = client_id
        and (c.is_wholesale is not true or c.owner_seller_id = auth.uid())
    )
  ))
);

-- Item operations must follow the order's seller, even if an old permissive
-- item policy still exists.
create policy "Anabel inserts own order items" on public.order_items
as restrictive for insert to authenticated with check (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
);
create policy "Anabel updates own order items" on public.order_items
as restrictive for update to authenticated using (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
) with check (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
);
create policy "Anabel deletes own order items" on public.order_items
as restrictive for delete to authenticated using (
  auth.uid() <> '9876203c-8e16-48db-958e-37c54441fd9b'::uuid
  or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
);

-- Orders keep a snapshot of customer details. Only administrators may change
-- a shared client record or edit/delete an existing saved address.
drop policy if exists "Sellers can update clients" on public.clients;
drop policy if exists "Sellers can update addresses" on public.addresses;
drop policy if exists "Sellers can delete addresses" on public.addresses;

commit;
