begin;
alter table public.bank_import_batches add column if not exists deleted_at timestamptz;
alter table public.bank_import_batches add column if not exists deleted_by uuid references auth.users(id);
-- Keep the underlying evidence and ledger identities; hide deleted lots and guard every RPC.
do $$ declare signature text; begin
 foreach signature in array array['ingest_bank_statement(uuid,jsonb,jsonb)','decide_bank_statement(uuid,uuid,integer,jsonb)','commit_bank_statement(uuid,uuid,uuid,integer,jsonb)','review_bank_statement(uuid,uuid)'] loop
  if to_regprocedure('public.'||replace(signature,'(', '_before_v170(')) is null then
   execute format('alter function public.%s rename to %I',signature,split_part(signature,'(',1)||'_before_v170');
  end if;
 end loop;
end $$;
create or replace function public.delete_bank_statement(p_actor uuid,p_batch uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches; linked integer;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;
 if b.deleted_at is not null then return jsonb_build_object('deleted',true);end if;
 if b.version is distinct from p_version then raise exception 'El extracto cambió. Actualizá antes de eliminar.' using errcode='40001';end if;
 select count(*) into linked from bank_entry_ledger_links l where exists(select 1 from bank_import_batch_rows r where r.batch_id=b.id and r.entry_id=l.entry_id);
 update bank_import_batches set deleted_at=clock_timestamp(),deleted_by=p_actor,version=version+1 where id=b.id;
 insert into bank_statement_events(batch_id,action,before_value,after_value,actor_id)
 values(b.id,'batch.deleted',jsonb_build_object('version',b.version,'filename',b.filename),jsonb_build_object('linked_movements_preserved',linked),p_actor);
 return jsonb_build_object('deleted',true,'registeredPreserved',linked);
end;
$$;
create or replace function public.ingest_bank_statement(p_actor uuid,p_meta jsonb,p_rows jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare bid uuid;b bank_import_batches;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 bid:=ingest_bank_statement_before_v170(p_actor,p_meta,p_rows);
 select * into strict b from bank_import_batches where id=bid for update;
 if b.deleted_at is not null then
  update bank_import_batches set deleted_at=null,deleted_by=null,version=version+1 where id=bid;
  insert into bank_statement_events(batch_id,action,before_value,actor_id) values(bid,'batch.restored',jsonb_build_object('deleted_at',b.deleted_at),p_actor);
 end if;
 return bid;
end;
$$;
create or replace function public.decide_bank_statement(p_actor uuid,p_batch uuid,p_version integer,p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;
 if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 return decide_bank_statement_before_v170(p_actor,p_batch,p_version,p_decisions);
end;
$$;
create or replace function public.commit_bank_statement(p_actor uuid,p_key uuid,p_batch uuid,p_version integer,p_entries jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bank_import_batches;
begin
 if not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 select * into strict b from bank_import_batches where id=p_batch for update;
 if b.deleted_at is not null then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 return commit_bank_statement_before_v170(p_actor,p_key,p_batch,p_version,p_entries);
end;
$$;
create or replace function public.review_bank_statement(p_actor uuid,p_batch uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not (can_manage_financial_operations(p_actor) or can_manage_treasury_settlements(p_actor)) then raise exception 'Sin permiso.' using errcode='42501';end if;
 if exists(select 1 from bank_import_batches where id=p_batch and deleted_at is not null) then raise exception 'El extracto fue eliminado.' using errcode='40001';end if;
 return review_bank_statement_before_v170(p_actor,p_batch);
end;
$$;
do $$ declare signature text; begin
 foreach signature in array array['ingest_bank_statement(uuid,jsonb,jsonb)','decide_bank_statement(uuid,uuid,integer,jsonb)','commit_bank_statement(uuid,uuid,uuid,integer,jsonb)','review_bank_statement(uuid,uuid)'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',signature);
  execute format('grant execute on function public.%s to service_role',signature);
  execute format('revoke all on function public.%s from public,anon,authenticated,service_role',replace(signature,'(', '_before_v170('));
 end loop;
end $$;
revoke all on function public.delete_bank_statement(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_bank_statement(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
