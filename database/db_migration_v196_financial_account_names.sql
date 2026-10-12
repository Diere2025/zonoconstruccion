-- Keep legacy import aliases compatible with concise financial account names.
begin;
do $migration$
declare signature text; alias_name text; definition text;
begin
 foreach signature in array array[
  'public.import_bank_movements_legacy_v166(uuid,jsonb)',
  'public.configure_bank_statement_account(uuid,uuid,date)',
  'public.ingest_bank_statement_before_v170(uuid,jsonb,jsonb)',
  'public.save_bank_statement_file_account(uuid,text,uuid,integer,boolean)',
  'public.save_bank_statement_mp_account(uuid,uuid,text,integer)',
  'public.create_bank_statement_from_web(uuid,uuid,jsonb)'
 ] loop
  select pg_get_functiondef(to_regprocedure(signature)) into definition;
  if definition is null then raise exception 'Missing account import function: %',signature;end if;
  definition:=replace(definition,'^Cuenta[. ]MP([0-9]+|Caro)$','^(Cuenta[. ]+)?MP([0-9]+|Caro)$');
  definition:=replace(definition,'v_account.name not in (','regexp_replace(v_account.name, ''^Cuenta[. ]+'', '''', ''i'') not in (');
  foreach alias_name in array array['MP1','MP2','MP3','MP4','MP5','Galicia','Santander','ICBC'] loop
   definition:=replace(definition,quote_literal('Cuenta '||alias_name),quote_literal(alias_name));
  end loop;
  execute definition;
 end loop;
end $migration$;
update public.financial_accounts set name=regexp_replace(name,'^Cuenta[. ]+','','i') where name ~* '^Cuenta[. ]+';
update public.financial_accounts set name='MP3 Reserva Diego' where id='20d20d4b-e33d-4320-b144-614bb3233ef4' and name='Reserva Diego';
commit;

