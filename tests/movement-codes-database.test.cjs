const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
test('database assigns unique codes to historical/new cash movements and keeps codes across edits, retries and cancellations',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create table public.cash_transactions(id integer primary key,type text,amount numeric,notes text);insert into cash_transactions values(1,'egreso',47000,'Sueldo'),(2,'ingreso',100000,'Cobro');`);
  const migration=fs.readFileSync('database/db_migration_v164_movement_codes.sql','utf8');
  await db.exec(migration);
  const before=(await db.query('select * from cash_transactions order by id')).rows;
  assert.match(before[0].movement_code,/^PAG-\d{10}$/);
  assert.match(before[1].movement_code,/^COB-\d{10}$/);
  assert.equal(before[0].amount,'47000');assert.equal(before[1].notes,'Cobro');
  await db.exec(migration);
  assert.deepEqual((await db.query('select * from cash_transactions order by id')).rows,before);
  await db.exec(`update cash_transactions set amount=48000,movement_code='forged',type='ingreso' where id=1;`);
  assert.equal((await db.query('select movement_code from cash_transactions where id=1')).rows[0].movement_code,before[0].movement_code);
  await db.exec(`insert into cash_transactions(id,type,amount,movement_code) values(3,'egreso',48000,'forged'),(4,'ingreso',48000,'forged');`);
  const all=(await db.query('select movement_code from cash_transactions')).rows;
  assert.equal(new Set(all.map(r=>r.movement_code)).size,4);
  assert.ok(all.every(r=>r.movement_code!=='forged'));
  await db.exec("begin;insert into cash_transactions(id,type,amount) values(5,'egreso',1);rollback;");
  await db.exec("insert into cash_transactions(id,type,amount) values(5,'egreso',1);");
  assert.equal((await db.query('select count(distinct movement_code)::int n from cash_transactions')).rows[0].n,5);
 }finally{await db.close();}
});
