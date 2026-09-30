const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v122_cuota_simple_oct26.sql', 'utf8')
  .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout = '5s'");
    await db.query(sql);
    const verify = async () => {
      const rows = (await db.query("select name, surcharge_percentage, installments from payment_methods where is_active and (name ilike '%payway%' or name ilike '%cuota simple%') order by installments")).rows;
      if (rows.length !== 3 || rows.some((row, index) => row.name !== ['Cuota Simple x2 (oct26)', 'Cuota Simple x3 (oct26)', 'Cuota Simple x6 (oct26)'][index]
        || Number(row.surcharge_percentage) !== [22, 28, 45.5][index] || row.installments !== [2, 3, 6][index])) throw Error('Unexpected payment plans');
      return rows;
    };
    await verify();
    await db.query(sql); // Idempotent: a repeated migration must not add methods.
    const plans = await verify();
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify({ status: apply ? 'applied' : 'verified_and_rolled_back', plans }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
