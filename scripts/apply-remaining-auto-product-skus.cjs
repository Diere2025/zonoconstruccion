const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const sql = fs.readFileSync('database/db_migration_v158_remaining_auto_product_skus.sql', 'utf8').replace(/^\uFEFF/, '').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
(async () => {
 const db = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
 await db.connect();
 try {
  await db.query('begin'); await db.query("set local lock_timeout = '5s'");
  const ids=['4d9a8390-7317-45d0-a6ba-6d088af83961','8399e3a5-f237-488f-86e7-50b64163f876'];
  const read=async()=>(await db.query('select * from products where id=any($1::uuid[]) order by id',[ids])).rows;
  const before=await read();assert.equal(before.length,2);
  await db.query(sql);const after=await read();
  for(let i=0;i<2;i++) {
   assert.equal(after[i].sku,after[i].name);
   assert.deepEqual({...after[i],sku:before[i].sku},before[i],'Only SKU may change');
  }
  await db.query(sql);assert.deepEqual(await read(),after);
  await db.query(apply?'commit':'rollback');
  const result={status:apply?'applied':'verified_and_rolled_back',products:after.map((p,i)=>({id:p.id,name:p.name,previousSku:before[i].sku,sku:p.sku,price:p.price,stock:p.stock_current})),onlySkuChanged:true,idempotent:true};
  if(apply) fs.writeFileSync('tmp/remaining-auto-product-skus-verified.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
