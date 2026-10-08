// Production activation must be explicitly authorized. No fixture data is created.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
if (process.argv[2] !== '--activate-production-v136') throw new Error('Explicit activation flag required');
const ref = 'ckvbyfgsbjbfaqotmeld';
const connection = new URL(process.env.DATABASE_URL);
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`
  || !(connection.username.endsWith(`.${ref}`) || connection.hostname === `db.${ref}.supabase.co`)) throw new Error('Unexpected production project');
(async () => {
 const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
 await db.connect();
 try {
  await db.query('begin');
  await db.query("set local lock_timeout='5s'; set local statement_timeout='60s'");
  await db.query('lock table public.cash_transactions, public.supplier_payments, public.client_payments in share row exclusive mode');
  const balances = async () => (await db.query("select financial_account_id,currency,sum(case when type='ingreso' then amount else -amount end)::text net from cash_transactions group by 1,2 order by 1,2")).rows;
  const counts = async () => (await db.query('select (select count(*) from cash_transactions)::int movements,(select count(*) from supplier_payments)::int supplier_payments,(select count(*) from client_payments)::int client_payments')).rows[0];
  const before = { balances: await balances(), counts: await counts() };
  const sql = fs.readFileSync('database/db_migration_v136_financial_operations.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');
  await db.query(sql);
  const after = { balances: await balances(), counts: await counts() };
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Existing balances or payment counts changed; activation reverted');
  await db.query("notify pgrst, 'reload schema'");
  await db.query('commit');
  fs.mkdirSync('scratch/financial-operations-activation',{recursive:true});
  fs.writeFileSync('scratch/financial-operations-activation/verification.json',JSON.stringify({activatedAt:new Date().toISOString(),project:ref,before,after},null,2));
  console.log('PASS migration 136 committed to production; existing ledger balances and payment counts preserved');
  console.log(JSON.stringify(after.counts));
 } catch (error) { await db.query('rollback'); throw error; }
 finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
