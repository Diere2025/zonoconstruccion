// Read-only schema inspection by default. --apply installs public.meta_ad_account_loads.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const { Client } = require('pg');

process.loadEnvFile('.env.local');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});

(async () => {
  await client.connect();
  const check = async () => {
    const { rows } = await client.query(
      "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='meta_ad_account_loads' order by ordinal_position"
    );
    return rows;
  };
  const before = await check();
  const installed = before.length > 0;
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ installed, columns: before.length, changed: false }));
    return;
  }
  await client.query("set lock_timeout='4s'");
  await client.query("set statement_timeout='30s'");
  await client.query(fs.readFileSync('database/db_migration_v289_meta_ad_account_loads.sql', 'utf8'));
  const after = await check();
  console.log(JSON.stringify({ installed: after.length > 0, columns: after.length, changed: !installed }));
})()
  .catch(error => {
    console.error('No se pudo verificar/aplicar la migración:', error.code || error.message || 'DATABASE_ERROR');
    process.exitCode = 1;
  })
  .finally(() => client.end());
