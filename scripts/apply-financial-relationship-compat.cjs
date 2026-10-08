const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
process.loadEnvFile('.env.local');
const ref='ckvbyfgsbjbfaqotmeld',url=new URL(process.env.DATABASE_URL);
if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${ref}.supabase.co`||!url.username.endsWith(`.${ref}`))throw Error('Unexpected production project');
const apply=process.argv.includes('--apply');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});await db.connect();try{
await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='30s'");
await db.query('lock table public.supplier_payment_allocations in access exclusive mode');
const allocations=async()=>(await db.query('select payment_id,purchase_id,amount::text from public.supplier_payment_allocations order by payment_id,purchase_id')).rows;
const before=await allocations();
const sql=fs.readFileSync('database/db_migration_v137_financial_operations_legacy_relationship.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');
await db.query(sql);await db.query(sql);
assert.deepEqual(await allocations(),before);
const duplicate=await db.query("select count(*)::int n from (select payment_id,purchase_id from supplier_payment_allocations group by 1,2 having count(*)>1) d");assert.equal(duplicate.rows[0].n,0);
const key=await db.query("select array_agg(a.attname::text order by k.ordinality) cols from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum where c.conrelid='public.supplier_payment_allocations'::regclass and c.contype='p'");assert.deepEqual(key.rows[0].cols,['id']);
await db.query(apply?'commit':'rollback');console.log(`PASS legacy relationship compatibility ${apply?'committed':'rehearsed and rolled back'}; ${before.length} allocations preserved; repeatable migration`);
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
