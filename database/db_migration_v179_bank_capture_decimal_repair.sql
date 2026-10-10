begin;
-- Repairs parser metadata and provisional drafts only; never changes posted money.
alter table public.mp_bank_web_rows add column if not exists parser_original jsonb;
create or replace function public.canonical_mp_bank_capture(p_row jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare suffix text[];corrected numeric;clean_description text;
begin
 suffix:=regexp_match(p_row->>'description','[[:space:]]+,[[:space:]]*([0-9]{2})[[:space:]]*$');
 if suffix is null then return p_row;end if;
 clean_description:=regexp_replace(p_row->>'description','[[:space:]]+,[[:space:]]*[0-9]{2}[[:space:]]*$','');
 if translate(lower(trim(clean_description)),'áéíóúüñ','aeiouun') not in ('cobro','dinero recibido','ingreso de dinero','rendimiento bruto','rendimiento positivo de la inversion','costo de mercado pago','costo por intereses absorbidos','retencion impuesto ingresos brutos no inscripto buenos aires','movimiento desconocido','transferencia de dinero','pago') then return p_row;end if;
 if p_row->>'amount' !~ '^-?[0-9]+[.]00$' then raise exception 'Captura con centavos ambiguos; volver a leer Mercado Pago';end if;
 corrected:=abs((p_row->>'amount')::numeric)+suffix[1]::numeric/100;
 if (p_row->>'amount')::numeric<0 then corrected:=-corrected;end if;
 return p_row||jsonb_build_object('amount',to_char(corrected,'FM999999999999990.00'),'description',clean_description);
end $$;
create or replace function public.repair_mp_bank_capture_decimals(p_mp text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare w mp_bank_web_rows;e bank_statement_entries;fixed jsonb;new_key text;repaired integer:=0;bid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 for w in select * from mp_bank_web_rows where mp_account_id=p_mp and parser_original is null and description ~ '[[:space:]]+,[[:space:]]*[0-9]{2}[[:space:]]*$' order by id for update loop
  -- Confirmed sources and decided/posted drafts require manual review, never a silent rewrite.
  if w.statement_entry_id is not null then continue;end if;
  if w.prepared_entry_id is not null then
   select * into strict e from bank_statement_entries where id=w.prepared_entry_id for update;
   if e.source->>'origin' is distinct from 'web' or e.resolution<>'pending' or e.target_transaction_id is not null or exists(select 1 from bank_entry_ledger_links where entry_id=e.id) then continue;end if;
  end if;
  fixed:=canonical_mp_bank_capture(jsonb_build_object('description',w.description,'amount',to_char(w.amount,'FM999999999999990.00')));
  if fixed->>'description'=w.description then continue;end if;
  new_key:=md5(jsonb_build_array(w.operation_id,w.occurred_at,(fixed->>'amount')::numeric,fixed->>'description',w.occurrence)::text);
  if exists(select 1 from mp_bank_web_rows where mp_account_id=p_mp and capture_key=new_key and id<>w.id) then continue;end if;
  update mp_bank_web_rows set parser_original=jsonb_build_object('description',w.description,'amount',w.amount,'captureKey',w.capture_key),description=fixed->>'description',amount=(fixed->>'amount')::numeric,capture_key=new_key where id=w.id;
  if w.prepared_entry_id is not null then
   -- Preserve any manual concept, raw source, and original capture in the repair evidence.
   update bank_statement_entries set signed_amount=(fixed->>'amount')::numeric,description=case when description=w.description then fixed->>'description' else description end,
    source=source||jsonb_build_object('parserOriginal',jsonb_build_object('description',w.description,'amount',w.amount),'amount',fixed->>'amount','cents',(fixed->>'amount')::numeric*100,'description',case when description=w.description then fixed->>'description' else description end),version=version+1 where id=e.id;
   update bank_import_batch_rows set source=source||jsonb_build_object('parserOriginal',jsonb_build_object('description',w.description,'amount',w.amount),'amount',fixed->>'amount','cents',(fixed->>'amount')::numeric*100,'description',fixed->>'description') where entry_id=e.id;
  end if;
  repaired:=repaired+1;
 end loop;
 for bid in select distinct b.id from bank_import_batches b join bank_import_batch_rows r on r.batch_id=b.id join bank_statement_entries be on be.id=r.entry_id join mp_bank_web_rows cw on cw.prepared_entry_id=be.id where cw.mp_account_id=p_mp and cw.parser_original is not null and b.parser_version='mp-web-v1' loop
  update bank_import_batches b set totals=totals||(select jsonb_build_object('incoming',coalesce(sum(greatest(be.signed_amount,0)*100),0),'outgoing',coalesce(sum(greatest(-be.signed_amount,0)*100),0),'net',coalesce(sum(be.signed_amount*100),0)) from bank_import_batch_rows r join bank_statement_entries be on be.id=r.entry_id where r.batch_id=bid and r.result='valid') where b.id=bid;
 end loop;
 return repaired;
end $$;
create or replace function public.sync_mp_bank_inbox(p_mp text,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare account uuid;owner uuid;ids jsonb;bid uuid;n integer:=0;payment_ref record;entry_record record;description_key text;direction_key text;target_name text;concept_choice uuid;concept_count integer;
begin
 if p_actor is not null and not can_manage_financial_operations(p_actor) then raise exception 'Sin permiso.' using errcode='42501';end if;
 select m.financial_account_id,coalesce(p_actor,i.actor_id,s.created_by,m.updated_by) into account,owner from bank_statement_mp_accounts m left join mp_bank_inbox_settings i on i.mp_account_id=m.mp_account_id left join bank_account_import_settings s on s.financial_account_id=m.financial_account_id where m.mp_account_id=p_mp;
 if account is null or owner is null then return jsonb_build_object('prepared',0,'pendingConfiguration',true);end if;
 if not can_manage_financial_operations(owner) then return jsonb_build_object('prepared',0,'pendingConfiguration',true);end if;
 if p_actor is not null then insert into mp_bank_inbox_settings(mp_account_id,actor_id) values(p_mp,p_actor) on conflict(mp_account_id) do update set actor_id=excluded.actor_id,configured_at=now();end if;
 perform pg_advisory_xact_lock(hashtextextended('bank_statement_commit',0));
 perform repair_mp_bank_capture_decimals(p_mp);
 perform reconcile_mp_bank_web(p_mp);
 perform enrich_mp_bank_reference_metadata(p_mp);
 select jsonb_agg(id::text) into ids from (select w.id from mp_bank_web_rows w where w.mp_account_id=p_mp and w.prepared_entry_id is null and w.statement_entry_id is null
 and w.occurred_at>='2026-10-01T00:00:00-03:00' and (select count(*) from mp_bank_web_rows x where x.mp_account_id=p_mp and x.operation_id=w.operation_id and x.amount=w.amount and date_trunc('minute',x.occurred_at)=date_trunc('minute',w.occurred_at))=1 order by w.occurred_at,w.id limit 1000) ready;
 if ids is not null then
  bid:=create_bank_statement_from_web(owner,account,ids);n:=jsonb_array_length(ids);
  update mp_bank_web_rows set prepared_batch_id=bid where id::text in(select value from jsonb_array_elements_text(ids));
 end if;
 update mp_bank_web_rows w set prepared_batch_id=(select b.id from bank_import_batch_rows r join bank_import_batches b on b.id=r.batch_id where r.entry_id=w.prepared_entry_id and b.deleted_at is null order by b.created_at desc limit 1) where w.mp_account_id=p_mp and w.prepared_entry_id is not null and w.prepared_batch_id is null;
 for entry_record in select e.id,e.description,e.signed_amount from bank_statement_entries e join mp_bank_web_rows w on w.prepared_entry_id=e.id where w.mp_account_id=p_mp and e.financial_concept_id is null and (e.version=1 or (e.version=2 and w.parser_original is not null)) and w.review_version=1 and not exists(select 1 from bank_entry_ledger_links l where l.entry_id=e.id) loop
  description_key:=translate(lower(trim(entry_record.description)),'áéíóúüñ','aeiouun');direction_key:=case when entry_record.signed_amount>0 then 'ingreso' else 'egreso' end;
  select count(distinct financial_concept_id),min(financial_concept_id::text)::uuid into concept_count,concept_choice from bank_classification_rules where is_active and description=description_key and direction=direction_key and financial_account_id=account;
  if concept_count=0 then select count(distinct financial_concept_id),min(financial_concept_id::text)::uuid into concept_count,concept_choice from bank_classification_rules where is_active and description=description_key and direction=direction_key and financial_account_id is null;end if;
  if concept_count=0 then
   target_name:=case when description_key='movimiento de cuentas' then 'Movimiento de cuentas' when direction_key='ingreso' and description_key in ('cobro','dinero recibido','ingreso de dinero') then 'Cobro' when direction_key='ingreso' and description_key in ('rendimiento bruto','rendimiento positivo de la inversion') then 'MP - Intereses Ganados' when direction_key='egreso' and description_key='costo de mercado pago' then 'Costo de Mercado Pago' when direction_key='egreso' and description_key='costo por intereses absorbidos' then 'Costo por intereses absorbidos' when direction_key='egreso' and description_key='retencion impuesto ingresos brutos no inscripto buenos aires' then 'Retenciones - IIBB' end;
   select count(*),min(id::text)::uuid into concept_count,concept_choice from financial_concepts where is_active and concept=target_name and (target_name<>'Cobro' or translate(lower(category),'áéíóúüñ','aeiouun')='recaudacion') and (target_name<>'MP - Intereses Ganados' or lower(category)='inversiones');
  end if;
  if concept_count=1 then update bank_statement_entries set financial_concept_id=concept_choice where id=entry_record.id and financial_concept_id is null;update mp_bank_web_rows set proposed_concept_id=concept_choice where prepared_entry_id=entry_record.id and proposed_concept_id is null;end if;
 end loop;
 for payment_ref in select distinct payment_id from mp_bank_web_rows where mp_account_id=p_mp and payment_id is not null loop perform sync_mp_bank_payment_reference(payment_ref.payment_id);delete from mp_bank_reference_retry where payment_id=payment_ref.payment_id;end loop;
 return jsonb_build_object('prepared',n,'financialWrites',0);
end $$;
create or replace function public.capture_mp_bank_web(p_mp text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;canonical jsonb;item jsonb;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Captura inválida: hasta 200 filas.';end if;
 perform repair_mp_bank_capture_decimals(p_mp);
 select coalesce(jsonb_agg(canonical_mp_bank_capture(value)),'[]'::jsonb) into canonical from jsonb_array_elements(p_rows);
 for item in select value from jsonb_array_elements(canonical) loop
  if exists(select 1 from mp_bank_web_rows w where w.mp_account_id=p_mp and w.parser_original is null and w.description ~ '[[:space:]]+,[[:space:]]*[0-9]{2}[[:space:]]*$' and w.operation_id=item->>'operationId' and w.occurred_at=(item->>'occurredAt')::timestamptz and w.occurrence=(item->>'occurrence')::integer and canonical_mp_bank_capture(jsonb_build_object('description',w.description,'amount',to_char(w.amount,'FM999999999999990.00')))->>'description'=item->>'description') then
   raise exception 'Captura anterior requiere revisión manual; no se creará otro movimiento';
  end if;
 end loop;
 result:=capture_mp_bank_web_before_inbox(p_mp,canonical);
 return result||jsonb_build_object('inbox',sync_mp_bank_inbox(p_mp));
end $$;
revoke all on function public.canonical_mp_bank_capture(jsonb),public.repair_mp_bank_capture_decimals(text) from public,anon,authenticated;
grant execute on function public.canonical_mp_bank_capture(jsonb),public.repair_mp_bank_capture_decimals(text) to service_role;
notify pgrst,'reload schema';
commit;
