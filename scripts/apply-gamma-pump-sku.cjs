const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v157_gamma_pump_sku.sql', 'utf8').replace(/^\uFEFF/, '').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
(async () => {
 const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
 await db.connect();
 try {
  await db.query('begin');
  await db.query("set local lock_timeout = '5s'");
  const read = async () => (await db.query('select * from products where id=$1', ['670bf0b6-26f1-491b-a3d1-9dff2cce35a1'])).rows[0];
  const before = await read();
  assert.ok(before);
  await db.query(sql);
  const after = await read();
  assert.equal(after.sku, 'Gamma - Bomba periferica Agua 1/2Hp (G2783AR)');
  assert.deepEqual({...after,sku:before.sku},before,'Only the SKU may change');
  await db.query(sql);
  assert.deepEqual(await read(),after,'Migration must be idempotent');
  await db.query(apply ? 'commit' : 'rollback');
  const result = {status:apply?'applied':'verified_and_rolled_back',id:after.id,name:after.name,previousSku:before.sku,sku:after.sku,price:after.price,stock:after.stock_current,onlySkuChanged:true,idempotent:true};
  if(apply) fs.writeFileSync('tmp/gamma-pump-sku-verified.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
 } catch(e) {await db.query('rollback');throw e;}
 finally {await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
