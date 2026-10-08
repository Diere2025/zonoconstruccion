const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const apply = process.argv.includes('--apply');
const names = ['Adicionales Instalación Biofort', 'Terminación Instalación Biofort'];
const where = "name ~* '^kit instalaci[oó]n ' or name=any($1)";
let checks = 0;
const equal = (a,b) => { assert.deepEqual(a,b);checks++; };
(async()=>{
 await db.connect();await db.query('begin');
 try {
  await db.query("set local lock_timeout='5s';set local statement_timeout='30s'");
  const before = (await db.query('select * from public.products where '+where,[names])).rows;
  assert.ok(before.length>=3);checks++;
  if(apply){fs.mkdirSync('output/visits-tests',{recursive:true});fs.writeFileSync(`output/visits-tests/services-before-${Date.now()}.json`,JSON.stringify(before,null,2));}
  const sql=fs.readFileSync('database/db_migration_v152_installation_services.sql','utf8');await db.query(sql);await db.query(sql);
  const services=(await db.query('select id,name,is_service,stock_physical,stock_reserved,stock_current,price from public.products where '+where,[names])).rows;
  for(const p of services){const old=before.find(b=>b.id===p.id);equal(p.is_service,true);equal([p.stock_physical,p.stock_reserved,p.stock_current].map(Number),[old.stock_physical,old.stock_reserved,old.stock_current].map(Number));equal(Number(p.price),Number(old.price));}
  // Verify inserts, edits and deletions in a savepoint so activation keeps no test movements.
  await db.query('savepoint fixtures');
  for(const p of services){
   for(const type of ['Reserva Pedido','Cancelacion Pedido','Entrega','Compra','Ajuste','Produccion Ingreso','Produccion Consumo']){
    const result=await db.query('insert into public.inventory_transactions(product_id,quantity,type) values($1,7,$2) returning id',[p.id,type]);equal(result.rowCount,0);
   }
   await db.query('update public.products set stock_physical=123,stock_reserved=5,stock_current=118 where id=$1',[p.id]);
   const expected=[p.stock_physical,p.stock_reserved,p.stock_current].map(Number);
   equal((await db.query('select stock_physical,stock_reserved,stock_current from public.products where id=$1',[p.id])).rows.map(r=>Object.values(r).map(Number)),[expected]);
   const old=(await db.query('select id from public.inventory_transactions where product_id=$1 limit 1',[p.id])).rows[0];
   if(old){await db.query('delete from public.inventory_transactions where id=$1',[old.id]);equal((await db.query('select stock_physical,stock_reserved,stock_current from public.products where id=$1',[p.id])).rows.map(r=>Object.values(r).map(Number)),[expected]);}
  }
  const physical=(await db.query('select id,stock_physical,stock_reserved,stock_current from public.products where not is_service and not is_discontinued and stock_physical is not null limit 1')).rows[0];
  assert.ok(physical);const movement=(await db.query("insert into public.inventory_transactions(product_id,quantity,type) values($1,1,'Ajuste') returning id",[physical.id])).rows[0];assert.ok(movement);checks++;
  equal(Number((await db.query('select stock_physical from public.products where id=$1',[physical.id])).rows[0].stock_physical),Number(physical.stock_physical)+1);
  const reservation=await db.query("insert into public.inventory_transactions(product_id,quantity,type) values($1,2,'Reserva Pedido') returning id",[physical.id]);equal(reservation.rowCount,1);
  const reserved=(await db.query('select stock_reserved,stock_current from public.products where id=$1',[physical.id])).rows[0];equal(Number(reserved.stock_reserved),Number(physical.stock_reserved)+2);equal(Number(reserved.stock_current),Number(physical.stock_current)+1-2);
  await db.query('rollback to savepoint fixtures');
  await db.query(apply?'commit':'rollback');
  console.log(JSON.stringify({checks,mode:apply?'activated':'tested and rolled back',services:services.length,historicalMovements:'preserved',orders:'unchanged'}));
 }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
