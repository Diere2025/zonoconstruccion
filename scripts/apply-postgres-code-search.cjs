// Apply only the measured missing index. Does not change order data or permissions.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  await db.connect();
  await db.query("SET lock_timeout='3s'");
  await db.query("SET statement_timeout='120s'");
  const sql = fs.readFileSync('database/db_migration_v105_postgres_code_search.sql', 'utf8');
  const statement = sql.match(/CREATE INDEX CONCURRENTLY[\s\S]*?;/)?.[0];
  if (!statement) throw new Error('missing_index_statement');
  await db.query(statement);
  const result = await db.query("select i.indisvalid,i.indisready,pg_size_pretty(pg_relation_size(i.indexrelid)) as size from pg_index i where i.indexrelid=to_regclass('public.idx_orders_legacy_code_trgm')");
  console.log(JSON.stringify(result.rows));
  if (!result.rows[0]?.indisvalid || !result.rows[0]?.indisready) throw new Error('index_not_ready');
})().catch(error => { console.error('Index migration failed:', error.code || error.message); process.exitCode = 1; }).finally(() => db.end());
