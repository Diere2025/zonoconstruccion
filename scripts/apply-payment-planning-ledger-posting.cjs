// Rehearse by default; --apply installs v120.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v120_payment_planning_ledger_posting.sql','utf8')
  .replace(/^\s*begin;\s*$/m,'').replace(/^\s*commit;\s*$/m,'');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    application_name: apply ? 'payment_planning_ledger_posting_apply' : 'payment_planning_ledger_posting_rehearsal' });
  await db.connect();
  try {
    await db.query('begin');
    try {
      await db.query("set local lock_timeout='5s'");
      await db.query("set local statement_timeout='120s'");
      await db.query(sql);
      const installed = (await db.query("select to_regprocedure('public.payment_planning_realize_with_movement(uuid,uuid,jsonb)') is not null as installed")).rows[0].installed;
      if (!installed) throw new Error('No se instaló la función de realización vinculada.');
      if (apply) {
        await db.query("notify pgrst,'reload schema'");
        await db.query('commit');
      } else await db.query('rollback');
      console.log(JSON.stringify({ migration: 'v120', status: apply ? 'applied' : 'rehearsed_and_rolled_back' }));
    } catch (error) { await db.query('rollback'); throw error; }
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
