// Inspect and rehearse by default. --apply commits the additive payment-planning schema.
const fs = require('node:fs');
const { Client } = require('pg');

process.loadEnvFile('.env.local');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v115_payment_planning.sql', 'utf8')
  .replace(/^\s*begin;\s*$/m, '')
  .replace(/^\s*commit;\s*$/m, '');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: apply ? 'payment_planning_migration_apply' : 'payment_planning_migration_rehearsal' });

(async () => {
  await db.connect();
  const state = (await db.query(`select
    to_regclass('public.payment_planning_funds') is not null as funds,
    to_regclass('public.payment_planning_items') is not null as items,
    to_regprocedure('public.payment_planning_mutate(uuid,uuid,text,jsonb)') is not null as mutation`)).rows[0];
  if (Object.values(state).every(Boolean)) {
    console.log(JSON.stringify({ migration: 'v115', status: 'already_installed', changed: false }));
    return;
  }
  if (Object.values(state).some(Boolean)) throw new Error('Se encontró una instalación parcial; requiere revisión antes de continuar.');
  await db.query('begin');
  try {
    await db.query("set local lock_timeout='5s'");
    await db.query("set local statement_timeout='120s'");
    await db.query(sql);
    const result = (await db.query(`select
      (select count(*)::integer from public.payment_planning_funds) as funds,
      (select count(*)::integer from public.payment_planning_items) as items,
      to_regprocedure('public.payment_planning_mutate(uuid,uuid,text,jsonb)') is not null as mutation`)).rows[0];
    if (result.funds !== 3 || result.items !== 0 || !result.mutation) throw new Error('La verificación de la migración no coincide.');
    if (apply) {
      await db.query("notify pgrst, 'reload schema'");
      await db.query('commit');
      console.log(JSON.stringify({ migration: 'v115', status: 'applied', ...result }));
    } else {
      await db.query('rollback');
      console.log(JSON.stringify({ migration: 'v115', status: 'rehearsed', changes: 'rolled_back', ...result }));
    }
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
})().catch(error => { console.error(`Migración v115: ${error.code || error.message}`); process.exitCode = 1; }).finally(() => db.end());
