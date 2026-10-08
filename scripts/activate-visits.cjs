// Additive installation; no client, order or financial rows are modified.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='90s'");
    await db.query('select pg_advisory_xact_lock(147147)');
    const installed = (await db.query("select to_regclass('public.visit_cases') is not null installed")).rows[0].installed;
    if (installed) { await db.query('rollback'); console.log('Visitas ya está instalado. No se realizaron cambios.'); return; }
    const policies = await db.query("select * from pg_policies where schemaname in ('public','storage')");
    const hooks = await db.query("select setdatabase,setrole,setconfig from pg_db_role_setting where setrole=(select oid from pg_roles where rolname='authenticator')");
    fs.mkdirSync('output/visits-tests', { recursive: true });
    fs.writeFileSync(`output/visits-tests/pre-install-${Date.now()}.json`, JSON.stringify({ policies: policies.rows, hooks: hooks.rows }, null, 2));
    await db.query(fs.readFileSync('database/db_migration_v147_visits.sql', 'utf8'));
    const check = (await db.query("select count(*)::int cases from public.visit_cases")).rows[0];
    if (check.cases !== 0) throw new Error('Unexpected initial visits');
    await db.query('commit');
    console.log(JSON.stringify({ installed: 'v147', initialCases: 0, legacyDataModified: false, policySnapshot: 'output/visits-tests' }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.code || error.name, error.message); process.exitCode = 1; });
