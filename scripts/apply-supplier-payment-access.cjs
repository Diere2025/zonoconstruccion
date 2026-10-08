// Run after explicit authorization to change production finance permissions.
const { Client } = require('pg');
const fs = require('node:fs');
const assert = require('node:assert/strict');
process.loadEnvFile('.env.local');
if (process.argv[2] !== '--activate-production-v142') throw new Error('Explicit activation flag required');
const ref = 'ckvbyfgsbjbfaqotmeld';
const connection = new URL(process.env.DATABASE_URL);
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`
  || !(connection.username.endsWith(`.${ref}`) || connection.hostname === `db.${ref}.supabase.co`)) throw new Error('Unexpected project');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='3s'; set local statement_timeout='30s'");
    await db.query('lock table cash_transactions,supplier_payments in share row exclusive mode');
    const totals = async () => (await db.query("select 'cash' source,currency,count(*)::text count,sum(case when type='ingreso' then amount else -amount end)::text amount from cash_transactions group by currency union all select 'supplier',currency,count(*)::text,sum(amount)::text from supplier_payments group by currency order by 1,2")).rows;
    const before = await totals();
    const sql = fs.readFileSync('database/db_migration_v142_supplier_payment_access.sql','utf8').replace(/^begin;/im,'').replace(/^commit;/im,'');
    await db.query(sql);
    assert.deepEqual(await totals(),before,'Existing financial records changed');
    const permissions = await db.query("select count(*)::int n from sellers s join auth.users u on u.id=s.id where s.full_name ilike '%laura%' and s.is_active and can_manage_financial_operations(u.id)");
    assert.ok(permissions.rows[0].n > 0,'Laura permission verification failed');
    await db.query('commit');
    console.log('PASS production supplier payment permissions corrected; Laura authorized; existing movement counts and balances preserved');
  } catch (e) { await db.query('rollback'); throw e; }
  finally { await db.end(); }
})().catch(e=>{console.error(e.code || e.message);process.exitCode=1;});
