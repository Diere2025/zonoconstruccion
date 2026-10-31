const fs=require('fs'),path=require('path'),assert=require('assert/strict');const {PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${id(1)}');create table suppliers(id uuid primary key);insert into suppliers values('${id(2)}'),('${id(3)}');create table supplier_purchases(id uuid primary key);create table supplier_payments(id uuid primary key);create function can_manage_financial_operations(uuid) returns boolean language sql as $$select $1='${id(1)}'::uuid$$;`);
 await db.exec(fs.readFileSync('database/db_migration_v243_supplier_source_traceability.sql','utf8'));await db.exec(fs.readFileSync('database/db_migration_v257_supplier_alias_review.sql','utf8'));
 await db.exec(fs.readFileSync('database/db_migration_v263_supplier_alias_unspecified_condition.sql','utf8'));
 const body={sourceBook:'source_book_001',sourceAlias:'Proveedor.Cuenta1',supplierId:id(2),condition:'facturado',businessLabel:'Zono',status:'verified',reason:'Equivalencia comprobada',version:0};
 const save=async(payload,key=10,actor=1)=>(await db.query('select review_supplier_alias($1,$2,$3::jsonb) r',[id(actor),id(key),JSON.stringify(payload)])).rows[0].r;
 const first=await save(body);assert.equal(first.status,'verified');assert.equal((await save(body)).id,first.id);await assert.rejects(save(body,11),/cambió/);await assert.rejects(save({...body,supplierId:id(3)},10),/reutilizada/);await assert.rejects(save({...body,version:1},12,9),/permiso/);
 const updated=await save({...body,supplierId:id(3),version:1,reason:'Corrección respaldada'},13);assert.equal(updated.version,2);assert.equal((await db.query('select count(*)::int n from supplier_alias_events')).rows[0].n,2);
 const unspecified=await save({...body,sourceAlias:'Proveedor sin etiqueta',version:0,condition:null},14);assert.equal(unspecified.document_condition,null);
 console.log('Aliases: verified identity, internal tags, idempotence, optimistic versions, audit and permissions: OK');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
