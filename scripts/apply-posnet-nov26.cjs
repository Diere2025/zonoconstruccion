const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v226_posnet_nov26.sql', 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout = '5s'");
    const before = (await db.query('select * from payment_methods order by id')).rows;
    const counts = (await db.query('select count(*) orders from orders')).rows;
    const verify = async () => {
      const rows = (await db.query("select id,name,surcharge_percentage,installments from payment_methods where is_active and name ~* 'payway|cuota\\s+simple|posnet|point\\s*(1\\s*pago|tarjeta)|tarjeta\\s+naranja' order by installments")).rows;
      assert.deepEqual(rows.map(r => [r.name, Number(r.surcharge_percentage), r.installments]), [['Posnet x1 (Nov26)', 10, 1], ['Posnet x3 (Nov26)', 25, 3], ['Posnet x6 (Nov26)', 43, 6]]);
      return rows;
    };
    await db.query(sql);
    const first = await verify();
    await db.query(sql);
    assert.deepEqual(await verify(), first);
    const after = (await db.query('select * from payment_methods order by id')).rows;
    for (const old of before.filter(r => !/^Posnet x[136] \(Nov26\)$/.test(r.name))) {
      const current = after.find(r => r.id === old.id);
      assert.ok(current);
      const { is_active, is_default, ...original } = old;
      const { is_active: active, is_default: defaultValue, ...saved } = current;
      assert.deepEqual(saved, original);
      if (!/payway|cuota\s+simple|posnet|point\s*(1\s*pago|tarjeta)|tarjeta\s+naranja/i.test(old.name)) assert.deepEqual(current, old);
    }
    assert.deepEqual((await db.query('select count(*) orders from orders')).rows, counts);
    if (apply) {
      fs.mkdirSync('output/posnet-nov26', { recursive: true });
      fs.writeFileSync('output/posnet-nov26/payment-methods-before.json', JSON.stringify(before, null, 2));
    }
    await db.query(apply ? 'commit' : 'rollback');
    console.log(JSON.stringify({ status: apply ? 'applied' : 'verified_and_rolled_back', plans: first }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
