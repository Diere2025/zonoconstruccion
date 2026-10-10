create schema auth;
create schema storage;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;
end $$;
create table auth.users(id uuid primary key,email text,is_admin boolean not null default false);
create table public.sellers(id uuid primary key,role text,roles text[],email text,is_active boolean default true);
create table public.financial_accounts(id uuid primary key default gen_random_uuid(),name text,type text,currency text,is_active boolean default true);
create table public.payment_methods(id uuid primary key default gen_random_uuid(),name text);
create table public.financial_concepts(id uuid primary key default gen_random_uuid(),concept text,category text,sub_category text default '',efe_category text default '',movement_type text,is_active boolean default true,source_row int);
create table public.financial_operations(id uuid primary key default gen_random_uuid(),operation_type text,effective_date date,status text default 'posted',version int default 1,detail jsonb default '{}',origin text default 'movements',created_by uuid references auth.users(id),created_at timestamptz default clock_timestamp(),updated_at timestamptz default clock_timestamp());
create table public.cash_transactions(id uuid primary key default gen_random_uuid(),type text not null check(type in ('ingreso','egreso')),category text not null,sub_category text,efe_category text,business_unit text,amount numeric(15,2) not null check(amount>0),currency text,exchange_rate numeric,concept text,notes text,financial_concept_id uuid references financial_concepts(id),created_at timestamptz default clock_timestamp(),registered_at timestamptz default clock_timestamp(),created_by uuid references auth.users(id),payment_method_id uuid references payment_methods(id),financial_account_id uuid references financial_accounts(id),is_imported boolean default false,bank_import_key text,operation_id uuid references financial_operations(id),operation_line text,reversal_of_transaction_id uuid references cash_transactions(id),movement_code text);
create table public.financial_operation_events(id bigint generated always as identity,operation_id uuid references financial_operations(id),action text,before_value jsonb,after_value jsonb,reason text,actor_id uuid references auth.users(id),created_at timestamptz default clock_timestamp());
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create function public.can_manage_financial_operations(p_actor uuid) returns boolean language sql as $$select exists(select 1 from auth.users where id=p_actor and is_admin)$$;
create function public.can_manage_treasury_settlements(p_actor uuid) returns boolean language sql as $$select exists(select 1 from auth.users where id=p_actor and is_admin)$$;

create table public.orders(id uuid primary key default gen_random_uuid(),legacy_code text,customer_name text,order_date date,status text default 'Pendiente',created_at timestamptz default clock_timestamp());
create table public.mp_accounts(id text primary key,name text,alias text,is_active boolean default true);
create table public.mp_payments(id text primary key,account_id text references mp_accounts(id),amount numeric(15,2),received_at timestamptz,order_id uuid references orders(id),order_code text,is_verified boolean default true,is_hidden boolean default false,is_internal boolean default false);
