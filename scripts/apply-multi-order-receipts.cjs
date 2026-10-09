const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
process.loadEnvFile('.env.local');
if(process.argv[2]!=='--activate-production-v168')throw Error('Activation flag required');
const ref='ckvbyfgsbjbfaqotmeld',connection=new URL(process.env.DATABASE_URL);
if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!==ref+'.supabase.co'||!(connection.username.endsWith('.'+ref)||connection.hostname==='db.'+ref+'.supabase.co'))throw Error('Unexpected database project');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});await db.connect();try{
 await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='60s'");
 const snapshot=async()=>{const result={};for(const table of ['purchase_orders','purchase_order_items','purchase_receptions','purchase_reception_items','supplier_purchases','supplier_payments','products','inventory_transactions'])result[table]=(await db.query("select count(*)::int rows,md5(string_agg(md5(to_jsonb(t)::text),'' order by id)) fingerprint from public."+table+" t")).rows[0];return result;};
 const before=await snapshot();
 const oldFunction=(await db.query("select pg_get_functiondef('public.register_supplier_receipt(uuid,uuid,uuid,text,date,text,boolean,boolean,text,jsonb,uuid)'::regprocedure) definition")).rows[0].definition;
 fs.mkdirSync('output/multi-order-receipts',{recursive:true});fs.writeFileSync('output/multi-order-receipts/before-activation.json',JSON.stringify({before,oldFunction},null,2));
 const sql=fs.readFileSync('database/db_migration_v168_multi_order_receipts.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');await db.query(sql);
 assert.deepEqual(await snapshot(),before,'Existing receipts, debt, quantities or stock changed');
 const currentOld=(await db.query("select pg_get_functiondef('public.register_supplier_receipt(uuid,uuid,uuid,text,date,text,boolean,boolean,text,jsonb,uuid)'::regprocedure) definition")).rows[0].definition;assert.equal(currentOld,oldFunction,'Legacy receipt function changed');
 const privileges=(await db.query("select has_function_privilege('service_role','public.register_supplier_receipt_multi(uuid,uuid,uuid[],text,date,text,boolean,boolean,text,jsonb,uuid)','execute') service,has_function_privilege('authenticated','public.register_supplier_receipt_multi(uuid,uuid,uuid[],text,date,text,boolean,boolean,text,jsonb,uuid)','execute') direct")).rows[0];assert.equal(privileges.service,true);assert.equal(privileges.direct,false);
 await db.query("notify pgrst,'reload schema'");await db.query('commit');
 fs.writeFileSync('output/multi-order-receipts/activation.json',JSON.stringify({activatedAt:new Date().toISOString(),project:ref,existingDataPreserved:true,legacyFunctionPreserved:true},null,2));console.log('Multi-order receipt schema activated; existing receipts/debt/stock and legacy RPC preserved');
 }catch(error){await db.query('rollback');throw error;}finally{await db.end();}})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});

