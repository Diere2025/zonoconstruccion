// Rehearse by default; --apply enables the server-only planning RPCs.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v119_payment_planning_rpc_permissions.sql','utf8')
  .replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async () => {
  const db = new Client({ connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:10000,
    application_name:apply?'payment_planning_rpc_permissions_apply':'payment_planning_rpc_permissions_rehearsal' });
  await db.connect();
  try {
    await db.query('begin');
    try {
      await db.query("set local lock_timeout='5s'");
      await db.query(sql);
      const status = (await db.query(`select proname,prosecdef from pg_proc
        where oid in ('public.payment_planning_mutate(uuid,uuid,text,jsonb)'::regprocedure,
          'public.payment_planning_move_item(uuid,uuid,jsonb)'::regprocedure)`)).rows;
      if (status.length !== 2 || status.some(row => !row.prosecdef)) throw new Error('v119 incompleta');
      if (apply) {
        await db.query("notify pgrst,'reload schema'");
        await db.query('commit');
        console.log(JSON.stringify({ migration:'v119', status:'applied' }));
      } else {
        await db.query('rollback');
        console.log(JSON.stringify({ migration:'v119', status:'rehearsed', changes:'rolled_back' }));
      }
    } catch (error) { await db.query('rollback'); throw error; }
  } finally { await db.end(); }
})().catch(error => { console.error(`Migración v119: ${error.code || error.message}`); process.exitCode=1; });
