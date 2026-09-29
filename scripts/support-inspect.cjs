const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  await db.connect();
  await db.query('begin read only');
  const columns = await db.query("select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='sellers' order by ordinal_position");
  const identity = await db.query("select u.id, s.id as seller_id, s.is_active from auth.users u left join public.sellers s on s.id=u.id where lower(u.email)='diego.boveda@gmail.com'");
  const mapping = await db.query("select count(*)::int as users, count(s.id)::int as id_matches from auth.users u left join public.sellers s on s.id=u.id");
  const existing = await db.query("select tablename from pg_tables where schemaname='public' and tablename like 'support_%'");
  const support = existing.rowCount ? await db.query("select (select count(*) from public.support_admins where active)::int as administrators,(select count(*) from public.support_tickets)::int as tickets,(select count(*) from public.support_sectors)::int as sectors,(select count(*) from public.support_attachments)::int as attachments,(select count(*) from auth.users where email like 'support-test-%@example.invalid')::int as remaining_test_users") : null;
  console.log(JSON.stringify({ columns: columns.rows, administrator: identity.rows, identityMapping: mapping.rows, existing: existing.rows, support: support?.rows }));
  await db.query('rollback');
})().catch(e => { console.error('Inspection failed:', e.code || 'connection_failed'); process.exitCode = 1; }).finally(() => db.end());
