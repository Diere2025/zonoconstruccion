// Read-only schema inventory. Never prints connection credentials or business rows.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin read only');
    const columns = await db.query(`select table_name,column_name,data_type,is_nullable,column_default
      from information_schema.columns where table_schema='public'
      and table_name in ('cash_transactions','client_payments','supplier_payments','supplier_purchases','financial_accounts')
      order by table_name,ordinal_position`);
    const functions = await db.query(`select proname,pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and proname in ('is_admin','can_manage_treasury_settlements','sync_order_payment_to_ledger','validate_cash_register_open')`);
    const constraints = await db.query(`select conrelid::regclass::text as table_name,conname,pg_get_constraintdef(oid) definition
      from pg_constraint where conrelid in ('public.cash_transactions'::regclass,'public.supplier_payments'::regclass,'public.client_payments'::regclass)`);
    const policies = await db.query(`select tablename,policyname,cmd,qual,with_check from pg_policies
      where schemaname='public' and tablename in ('cash_transactions','supplier_payments','client_payments')`);
    console.log(JSON.stringify({columns:columns.rows,functions:functions.rows,constraints:constraints.rows,policies:policies.rows},null,2));
  } finally { await db.query('rollback'); await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode=1; });
