// Run only with explicit authorization to activate v139 in the shared production database.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const {readSeedSource,seedPeople}=require('./financial-people-seed.cjs');
process.loadEnvFile('.env.local');
if (process.argv[2] !== '--activate-production-v139') throw Error('Explicit activation flag required');
const ref = 'ckvbyfgsbjbfaqotmeld', connection = new URL(process.env.DATABASE_URL);
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`
  || !(connection.username.endsWith(`.${ref}`) || connection.hostname === `db.${ref}.supabase.co`)) throw Error('Unexpected production project');
const directory = path.join('scratch', 'financial-operations-activation', `v139-${Date.now()}`);
fs.mkdirSync(directory, { recursive: true });
async function backup() {
  const env = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432', PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password), PGDATABASE: connection.pathname.slice(1), PGSSLMODE: 'require', PGGSSENCMODE: 'disable', PGCONNECT_TIMEOUT: '15' };
  await new Promise((resolve, reject) => {
    const child = spawn('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe', ['--no-password', '--format=custom', '--schema=public', '--schema=auth', '--file', path.resolve(directory, 'before-v139.dump')], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', () => {}); // Never print connection diagnostics containing credentials.
    child.on('error', () => reject(Error('Backup could not start')));
    child.on('exit', code => code === 0 ? resolve() : reject(Error(`Backup failed (${code}); migration not applied`)));
  });
  assert.ok(fs.statSync(path.join(directory, 'before-v139.dump')).size > 0);
  console.log('PASS private pre-migration backup completed');
}
async function activate() {
  await backup();
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await db.connect();
  let committed = false;
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
    await db.query('lock table public.cash_transactions, public.supplier_payments, public.client_payments, public.financial_operations, public.supplier_payment_allocations in share row exclusive mode');
    const snapshot = async () => ({
      balances: (await db.query("select financial_account_id,currency,sum(case when type='ingreso' then amount else -amount end)::text net from public.cash_transactions group by 1,2 order by 1,2")).rows,
      records: (await db.query("select 'cash' name,count(*)::text n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) hash from public.cash_transactions t union all select 'suppliers',count(*)::text,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.supplier_payments t union all select 'clients',count(*)::text,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.client_payments t union all select 'operations',count(*)::text,md5(coalesce(string_agg((to_jsonb(t)-'person_id')::text,'|' order by id),'')) from public.financial_operations t union all select 'allocations',count(*)::text,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.supplier_payment_allocations t order by name")).rows,
    });
    const before = await snapshot();
    const sql = fs.readFileSync('database/db_migration_v139_financial_people.sql', 'utf8').replace(/^begin;/im, '').replace(/^commit;/im, '');
    await db.query(sql);
    const seed=await seedPeople(db,await readSeedSource(db));
    console.log('PASS initial personnel register prepared',JSON.stringify(seed));
    const after = await snapshot();
    assert.deepEqual(after, before, 'Existing financial data changed; rolling back');
    await db.query("notify pgrst, 'reload schema'");
    await db.query('commit');
    committed = true;
    fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ activatedAt: new Date().toISOString(), project: ref, seed, before, after }, null, 2));
    console.log('PASS migration 139 committed; all existing financial records and balances preserved');
    console.log(JSON.stringify(after.records.map(({ name, n }) => ({ name, count: n }))));
  } catch (error) {
    if (!committed) await db.query('rollback');
    else console.error('Migration committed; verification report could not be saved');
    throw error;
  } finally { await db.end(); }
}
activate().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
