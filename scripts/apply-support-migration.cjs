// Additive schema only. Inspect/read-only by default; --apply performs the migration.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
(async()=>{
  await db.connect();
  const existing=await db.query("select to_regclass('public.support_tickets') as existing");
  if(existing.rows[0].existing){console.log(JSON.stringify({schema:'already_exists',changed:false}));return;}
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({schema:'not_installed',migration:'v106',changed:false}));return;}
  await db.query('begin');await db.query("set local lock_timeout='4s'");await db.query("set local statement_timeout='60s'");
  await db.query(fs.readFileSync('database/db_migration_v106_support_tickets.sql','utf8'));
  const initial=await db.query("select a.user_id from public.support_admins a join public.support_profiles p on p.user_id=a.user_id join public.sellers s on s.id=p.seller_id where a.active and s.is_active is true");
  if(initial.rowCount!==1)throw new Error('Initial administrator verification failed');
  await db.query('commit');await db.query("notify pgrst, 'reload schema'");console.log(JSON.stringify({migration:'v106',applied:true,administrators:initial.rowCount}));
})().catch(async e=>{await db.query('rollback').catch(()=>{});console.error('Migration failed:',e.code||e.message);process.exitCode=1;}).finally(()=>db.end());
