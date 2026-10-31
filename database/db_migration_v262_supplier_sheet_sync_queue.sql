begin;
create table public.purchase_sheet_write_lease(singleton boolean primary key default true check(singleton),token uuid,expires_at timestamptz);
insert into purchase_sheet_write_lease(singleton) values(true);
create table public.supplier_sheet_sync_jobs (
 reception_id uuid primary key references purchase_receptions(id),status text not null default 'pending' check(status in ('pending','running','failed','done')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table purchase_sheet_write_lease enable row level security;alter table supplier_sheet_sync_jobs enable row level security;
revoke all on purchase_sheet_write_lease,supplier_sheet_sync_jobs from public,anon,authenticated;
grant select on supplier_sheet_sync_jobs to service_role;
create function public.claim_purchase_sheet_lease(p_token uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_token is null then raise exception 'Identidad de sincronización inválida.';end if;
 update purchase_sheet_write_lease set token=p_token,expires_at=clock_timestamp()+interval '5 minutes' where singleton and (token=p_token or expires_at is null or expires_at<clock_timestamp());return found;
end $$;
create function public.release_purchase_sheet_lease(p_token uuid) returns void
language sql security definer set search_path=public,pg_temp as $$update purchase_sheet_write_lease set token=null,expires_at=null where singleton and token=p_token$$;
create function public.enqueue_supplier_sheet_job(p_reception uuid,p_retry boolean default false) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from purchase_receptions where id=p_reception;if not found then raise exception 'Recepción inexistente.';end if;
 insert into supplier_sheet_sync_jobs(reception_id) values(p_reception) on conflict(reception_id) do update set
 status=case when p_retry and supplier_sheet_sync_jobs.status<>'running' then 'pending' else supplier_sheet_sync_jobs.status end,
 next_attempt_at=case when p_retry and supplier_sheet_sync_jobs.status<>'running' then clock_timestamp() else supplier_sheet_sync_jobs.next_attempt_at end;
end $$;
create function public.enqueue_supplier_sheet_reception() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin insert into supplier_sheet_sync_jobs(reception_id) values(new.id) on conflict do nothing;return null;end $$;
create trigger supplier_sheet_reception_queue after insert on purchase_receptions for each row execute function enqueue_supplier_sheet_reception();
create function public.claim_supplier_sheet_job(p_reception uuid,p_token uuid,p_supplier uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare job supplier_sheet_sync_jobs;
begin
 if not claim_purchase_sheet_lease(p_token) then return null;end if;
 select * into job from supplier_sheet_sync_jobs where (p_reception is null or reception_id=p_reception) and status<>'done'
 and (p_supplier is null or exists(select 1 from purchase_receptions r where r.id=reception_id and r.supplier_id=p_supplier))
 and (status<>'running' or lease_until<clock_timestamp()) and (p_reception is not null or next_attempt_at<=clock_timestamp()) order by next_attempt_at,reception_id limit 1 for update skip locked;
 if not found then perform release_purchase_sheet_lease(p_token);return null;end if;
 update supplier_sheet_sync_jobs set status='running',attempts=attempts+1,lease_token=p_token,lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp() where reception_id=job.reception_id returning * into job;return to_jsonb(job);
end $$;
create function public.finish_supplier_sheet_job(p_reception uuid,p_token uuid,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update supplier_sheet_sync_jobs set status=case when p_success then 'done' else 'failed' end,last_error=case when p_success then null else left(p_error,1000) end,
 next_attempt_at=case when p_success then next_attempt_at else clock_timestamp()+make_interval(secs=>least(3600,power(2,least(attempts,10))*15)::integer) end,
 lease_token=null,lease_until=null,updated_at=clock_timestamp() where reception_id=p_reception and lease_token=p_token and status='running' and lease_until>=clock_timestamp();
 if not found then raise exception 'La sincronización perdió su turno. Actualizá la cola.' using errcode='40001';end if;perform release_purchase_sheet_lease(p_token);
end $$;
create function public.get_supplier_sheet_queue(p_supplier uuid default null) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object('counts',(select jsonb_object_agg(status,n) from(select j.status,count(*) n from supplier_sheet_sync_jobs j join purchase_receptions r on r.id=j.reception_id where p_supplier is null or r.supplier_id=p_supplier group by j.status)c),
 'jobs',coalesce((select jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.reception_id) from(select j.*,r.delivery_slip_number,r.reception_date,s.name supplier_name from supplier_sheet_sync_jobs j join purchase_receptions r on r.id=j.reception_id join suppliers s on s.id=r.supplier_id where p_supplier is null or r.supplier_id=p_supplier order by case when j.status='done' then 1 else 0 end,j.updated_at desc limit 100)q),'[]'))
$$;
revoke all on function claim_purchase_sheet_lease(uuid),release_purchase_sheet_lease(uuid),enqueue_supplier_sheet_job(uuid,boolean),enqueue_supplier_sheet_reception(),claim_supplier_sheet_job(uuid,uuid,uuid),finish_supplier_sheet_job(uuid,uuid,boolean,text),get_supplier_sheet_queue(uuid) from public,anon,authenticated;
grant execute on function claim_purchase_sheet_lease(uuid),release_purchase_sheet_lease(uuid),enqueue_supplier_sheet_job(uuid,boolean),enqueue_supplier_sheet_reception(),claim_supplier_sheet_job(uuid,uuid,uuid),finish_supplier_sheet_job(uuid,uuid,boolean,text),get_supplier_sheet_queue(uuid) to service_role;
notify pgrst,'reload schema';
commit;
