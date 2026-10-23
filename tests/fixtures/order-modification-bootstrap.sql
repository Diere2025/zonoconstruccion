-- Minimal local Supabase shell. The support functions themselves are loaded
-- from the real migrations, rather than replacing support_command with a stub.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table sellers(id uuid primary key,email text,full_name text,is_active boolean default true);
insert into auth.users(id,email) values('381df0d1-183f-4ccb-aaf2-8147c76159a9','test@example.invalid');
insert into sellers(id,email,full_name) values('381df0d1-183f-4ccb-aaf2-8147c76159a9','test@example.invalid','Diego Bóveda');
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text);
create table orders(id uuid primary key default gen_random_uuid(),seller_id uuid references sellers(id),customer_name text,
 locality text,address text,freight_type text,initial_delivery_date date,max_delivery_date date,legacy_code text,channel text);
create table order_history(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),changed_by_id uuid references auth.users(id),
 changed_by_name text,change_reason text,original_data jsonb,modified_data jsonb);
