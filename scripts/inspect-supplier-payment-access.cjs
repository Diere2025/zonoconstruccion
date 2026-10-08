// Read-only diagnosis; credentials are never printed.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin read only');
    const policies = await db.query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('supplier_payments','cash_transactions','supplier_purchases')");
    const functions = await db.query("select proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('is_admin','can_manage_treasury_settlements','can_manage_financial_operations')");
    const users = await db.query("select s.id,s.role,s.roles,s.is_active,u.id auth_id from public.sellers s left join auth.users u on s.id=u.id or lower(s.email)=lower(u.email) where to_jsonb(s)::text ilike '%laura%'");
    const schema = await db.query("select column_name,data_type,column_default from information_schema.columns where table_schema='public' and table_name='supplier_payments' order by ordinal_position");
    const attempts = await db.query("select t.id,t.created_at,t.amount,t.concept,t.category,(select count(*)::int from supplier_payments p where p.cash_transaction_id=t.id) supplier_links from cash_transactions t where t.created_by=any($1::uuid[]) and t.created_at >= '2026-09-29' and (t.amount=1400000 or t.concept ilike '%fibrosur%') order by t.created_at", [users.rows.map(u => u.auth_id).filter(Boolean)]);
    console.log(JSON.stringify({ policies: policies.rows, functions: functions.rows, users: users.rows, schema: schema.rows, attempts: attempts.rows }, null, 2));
  } finally { await db.query('rollback'); await db.end(); }
})().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
