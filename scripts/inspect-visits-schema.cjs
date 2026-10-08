const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  await db.connect();
  try {
    await db.query('begin read only');
    const constraints = await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.sellers'::regclass and contype='c'");
    const columns = await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('sellers','products','orders') and column_name in ('id','role','roles','is_active','name','sku','price','order_code','order_number','customer_name','seller_id') order by table_name,column_name");
    const policies = await db.query("select tablename,policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('sellers','orders','clients','addresses','order_items','cash_transactions','order_payments')");
    const kits = await db.query("select count(*)::int count from public.products where is_active is distinct from false and lower(name) like '%kit instalaci%' and lower(name) not like '%adicional%'");
    const visits = await db.query("select to_regclass('public.visit_cases') is not null installed");
    const hook = await db.query("select unnest(rolconfig) setting from pg_roles where rolname='authenticator'");
    console.log(JSON.stringify({ constraints: constraints.rows, columns: columns.rows, policies: policies.rows, kitCount: kits.rows[0].count, installed: visits.rows[0].installed, preRequest: hook.rows.filter(r => r.setting.startsWith('pgrst.db_pre_request=')) }, null, 2));
    await db.query('rollback');
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.name, error.message); process.exitCode = 1; });
