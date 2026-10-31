const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create table auth.users(id uuid primary key);
   create table suppliers(id uuid primary key); create table supplier_purchases(id uuid primary key);
   create table supplier_payments(id uuid primary key);
   insert into auth.users values('00000000-0000-0000-0000-000000000001');
   insert into suppliers values('00000000-0000-0000-0000-000000000002');`);
  await db.exec(fs.readFileSync('database/db_migration_v243_supplier_source_traceability.sql','utf8'));
  await assert.rejects(db.exec(`insert into supplier_source_aliases(source_book,source_alias,supplier_id,status) values('book','Cooper.Cuenta2','00000000-0000-0000-0000-000000000002','verified')`));
  const batch=(await db.query(`insert into supplier_import_batches(source_book,snapshot_hash,cutoff_date,captured_at,created_by) values('book','hash','2026-10-30',now(),'00000000-0000-0000-0000-000000000001') returning id`)).rows[0].id;
  await db.query(`insert into supplier_import_rows(batch_id,sheet_id,source_row,component,content_hash,original_values) values($1,'sheet',2,'payment','rowhash','[]')`,[batch]);
  await assert.rejects(db.query(`insert into supplier_import_rows(batch_id,sheet_id,source_row,component,content_hash,original_values) values($1,'sheet',2,'payment','rowhash','[]')`,[batch]));
  await assert.rejects(db.exec(`update supplier_import_rows set status='excluded',reviewed_by='00000000-0000-0000-0000-000000000001',reviewed_at=now()`),'missing decision reason');
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('select * from supplier_import_rows'));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from supplier_purchases')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from supplier_payments')).rows[0].n,0);
  console.log('Supplier source migration: duplicate prevention, review evidence, permissions and zero posting: OK');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
