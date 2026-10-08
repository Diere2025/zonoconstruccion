const fs = require('node:fs');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v125_cuota_simple_extended_oct26.sql', 'utf8')
  .replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
const expected = [[2, 22], [3, 28], [6, 45.5], [9, 70], [12, 93], [18, 141]];
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout = '5s'");
    const verify = async () => {
      const rows = (await db.query("select id, name, surcharge_percentage, installments from payment_methods where is_active and name ilike '%cuota simple%' order by installments")).rows;
      if (rows.length !== expected.length || rows.some((row, index) =>
        row.name !== `Cuota Simple x${expected[index][0]} (oct26)`
        || Number(row.surcharge_percentage) !== expected[index][1]
        || row.installments !== expected[index][0])) throw Error('Unexpected payment plans');
      return rows;
    };
    await db.query(sql);
    const first = await verify();
    await db.query(sql);
    const second = await verify();
    if (JSON.stringify(first) !== JSON.stringify(second)) throw Error('Migration changed payment IDs on repeat');
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify({ status: apply ? 'applied' : 'verified_and_rolled_back', plans: second }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
