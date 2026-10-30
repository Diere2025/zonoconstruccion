// Read-only schema inspection by default. --apply installs additive address columns.
const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  await client.connect();
  const { rows } = await client.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name='addresses' and column_name in ('postal_code','via_cargo') order by column_name");
  const installed = rows.some(row => row.column_name === 'postal_code') && rows.some(row => row.column_name === 'via_cargo');
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ installed, columns: rows, changed: false })); return; }
  await client.query("set lock_timeout='4s'");
  await client.query("set statement_timeout='30s'");
  await client.query(fs.readFileSync('database/db_migration_20261029_via_cargo.sql', 'utf8'));
  console.log(JSON.stringify({ installed: true, changed: !installed }));
})().catch(error => { console.error('No se pudo verificar/aplicar la migración:', error.code || 'DATABASE_ERROR'); process.exitCode = 1; }).finally(() => client.end());
