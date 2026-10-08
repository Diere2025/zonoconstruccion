-- Installation services are saleable concepts without physical inventory.
alter table public.products add column if not exists is_service boolean not null default false;
update public.products set is_service=true
where name ~* '^kit instalaci[oó]n ' or name in ('Adicionales Instalación Biofort','Terminación Instalación Biofort');

create or replace function public.inventory_skip_services() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.products where id=new.product_id and is_service) then return null; end if;
 return new;
end $$;
drop trigger if exists inventory_skip_services on public.inventory_transactions;
create trigger inventory_skip_services before insert or update on public.inventory_transactions for each row execute function public.inventory_skip_services();

-- Deleting old service movements must not restore fictitious inventory.
do $$ declare definition text; begin
 select pg_get_functiondef('public.update_product_stock_levels()'::regprocedure) into definition;
 if position('-- v152 services' in definition)=0 then
  definition:=replace(definition,'  -- Obtener info del producto', $patch$
  -- v152 services
  if exists(select 1 from public.products where id=v_transaction.product_id and is_service) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  -- Obtener info del producto$patch$);
  if position('-- v152 services' in definition)=0 then raise exception 'Unexpected stock function definition'; end if;
  execute definition;
 end if;
end $$;

-- Also cover sheet syncs and direct stock adjustments on the catalogue.
create or replace function public.product_service_stock_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.name ~* '^kit instalaci[oó]n ' or new.name in ('Adicionales Instalación Biofort','Terminación Instalación Biofort') then new.is_service:=true;end if;
 if new.is_service then
  if tg_op='INSERT' then new.stock_physical:=0;new.stock_reserved:=0;new.stock_current:=0;
  else new.stock_physical:=old.stock_physical;new.stock_reserved:=old.stock_reserved;new.stock_current:=old.stock_current;end if;
 end if;
 return new;
end $$;
drop trigger if exists product_service_stock_guard on public.products;
create trigger product_service_stock_guard before insert or update on public.products for each row execute function public.product_service_stock_guard();
revoke all on function public.inventory_skip_services(),public.product_service_stock_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
