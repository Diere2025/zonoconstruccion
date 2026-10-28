const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');process.loadEnvFile('.env.local');
const apply=process.argv.includes('--apply');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:12000});try{
await db.connect();await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='20s'");
const digest=async()=>{const result={};for(const table of ['cash_transactions','financial_operations','financial_classification_snapshots','bank_classification_rules'])result[table]=(await db.query(`select count(*)::text n,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by ${table==='financial_classification_snapshots'?'transaction_id':'id'}::text),'')) hash from ${table} t`)).rows[0];return result;};
const before=await digest();
const definitions=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('enrich_mp_bank_reference_metadata','capture_mp_bank_activity_before_inbox','unclassified_financial_movements')")).rows;
fs.mkdirSync('output/activity-sync-fix',{recursive:true});if(apply)fs.writeFileSync('output/activity-sync-fix/functions-before-'+Date.now()+'.json',JSON.stringify(definitions,null,2));
for(const file of ['db_migration_v230_activity_sync_and_description.sql','db_migration_v232_reserve_movement_description.sql'])await db.query(fs.readFileSync('database/'+file,'utf8').replace(/^begin;\s*/,'').replace(/commit;\s*$/,''));
const start=Date.now();await db.query("select enrich_mp_bank_reference_metadata('diegozono_mp')");const enrichmentMs=Date.now()-start;
assert.deepEqual(await digest(),before);
const actor=(await db.query("select id from auth.users where lower(email)='diego.boveda@gmail.com'")).rows[0].id;
const rows=(await db.query('select unclassified_financial_movements_with_rules($1) value',[actor])).rows[0].value;
const summary={applied:apply,enrichmentMs,financialRowsUnchanged:true,unclassified:rows.map(r=>({code:r.code,description:r.description,counterparty:r.counterparty}))};
await db.query(apply?'commit':'rollback');fs.writeFileSync('output/activity-sync-fix/'+(apply?'applied':'rehearsal')+'.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
} catch(e){await db.query('rollback').catch(()=>{});throw e;}finally{await db.end();}})().catch(e=>{console.error(e.code||'',e.message);process.exitCode=1});
