const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
test('both enrichment loops cache canonical Activities, preserve unique matching, and prefer activity descriptions',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table mp_bank_activity_rows(id int,mp_account_id text,operation_id text,amount numeric,occurred_at timestamptz,name text,description text,is_reserve boolean);
 create table mp_bank_web_rows(id int,mp_account_id text,operation_id text,amount numeric,occurred_at timestamptz,counterparty_name text,activity_type text,operation_kind text);
 create table calls(id int);
 create function canonical_mp_bank_activity(p_mp text) returns setof mp_bank_activity_rows language plpgsql as $$begin insert into calls values(1);return query select * from mp_bank_activity_rows where mp_account_id=p_mp;end $$;
 create function capture_mp_bank_activity_before_inbox(text,jsonb) returns jsonb language plpgsql as $$begin perform reconcile_mp_bank_web(p_mp);return '{}'::jsonb;end $$;
 create function unclassified_financial_movements(uuid) returns jsonb language sql as $$select jsonb_build_object('description',coalesce(w.description,t.notes,t.concept,'')) from (values('Movimiento desconocido','Transferencia enviada',case when $1 is null then null else 'reserve_transfer' end)) w(description,activity_type,operation_kind) cross join (values('nota','concepto')) t(notes,concept)$$;`);
 let definition=fs.readFileSync('database/db_migration_v177_bank_inbox.sql','utf8').split('create or replace function public.enrich_mp_bank_reference_metadata')[1].split('create or replace function public.sync_mp_bank_payment_reference')[0];
 definition='create or replace function public.enrich_mp_bank_reference_metadata'+definition;
 definition=definition.replaceAll('from mp_bank_activity_rows','from canonical_mp_bank_activity(p_mp)').replace('declare activity_record','declare activity_cache mp_bank_activity_rows[];activity_record');
 const split=definition.indexOf('for w in select * from mp_bank_web_rows');
 definition=definition.slice(0,split)+'activity_cache:=array(select a from canonical_mp_bank_activity(p_mp) a);\n'+definition.slice(split).replaceAll('canonical_mp_bank_activity(p_mp)','unnest(activity_cache)');
 await db.exec(definition);
 const migration=fs.readFileSync('database/db_migration_v230_activity_sync_and_description.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(`insert into mp_bank_web_rows values(1,'mp','123456',-5900,'2026-10-28T09:24:00-03:00',null,null,null);
 insert into mp_bank_activity_rows values(1,'mp',null,-5900,'2026-10-28T09:24:00-03:00','Persona','Transferencia enviada',false),(2,'mp',null,100,'2026-10-28T09:25:00-03:00','Otro','Cobro',false);
 select enrich_mp_bank_reference_metadata('mp');`);
 assert.equal((await db.query('select count(*) n from calls')).rows[0].n,2);
 assert.equal((await db.query('select operation_id from mp_bank_activity_rows where id=1')).rows[0].operation_id,'123456');
 assert.equal((await db.query('select counterparty_name from mp_bank_web_rows')).rows[0].counterparty_name,'Persona');
 assert.equal((await db.query("select unclassified_financial_movements(null) value")).rows[0].value.description,'Transferencia enviada');
 await db.exec(fs.readFileSync('database/db_migration_v232_reserve_movement_description.sql','utf8'));
 assert.equal((await db.query("select unclassified_financial_movements('00000000-0000-4000-8000-000000000001') value")).rows[0].value.description,'Movimiento de cuentas');
 assert.equal((await db.query("select unclassified_financial_movements(null) value")).rows[0].value.description,'Transferencia enviada');
 const body=(await db.query("select pg_get_functiondef('capture_mp_bank_activity_before_inbox(text,jsonb)'::regprocedure) body")).rows[0].body;
 assert.ok(!body.includes('perform reconcile_mp_bank_web(p_mp);'));
 }finally{await db.close();}
});
