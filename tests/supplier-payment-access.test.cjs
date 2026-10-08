const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [path.resolve('.codex-tmp/supplier-account-check')] }));
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table auth.users(id uuid primary key,email text);
      create table sellers(id uuid primary key,email text,role text,roles text[],is_active boolean);
      create table supplier_purchases(id uuid primary key,supplier_id uuid,currency text);
      create table cash_transactions(id uuid primary key,created_by uuid,type text,amount numeric,currency text,financial_account_id uuid,payment_method_id uuid,operation_id uuid);
      create table supplier_payments(id uuid primary key default gen_random_uuid(),supplier_id uuid,purchase_id uuid,amount numeric,currency text,financial_account_id uuid,payment_method_id uuid,cash_transaction_id uuid,created_by uuid not null,reversed_at timestamptz);
      alter table supplier_payments enable row level security;
      grant usage on schema public,auth to authenticated;
      grant select on cash_transactions,supplier_purchases to authenticated;
      grant select,insert,update,delete on supplier_payments to authenticated;
      create policy read_payments on supplier_payments for select to authenticated using(true);
      insert into auth.users values('${id(1)}','finance@test'),('${id(2)}','seller@test'),('${id(3)}','inactive@test'),('${id(4)}','multiple@test'),('${id(5)}','admin@test');
      insert into sellers values('${id(1)}','finance@test','administracion',array['administracion'],true),('${id(2)}','seller@test','seller',array['seller'],true),('${id(3)}','inactive@test','administracion',array['administracion'],false),('${id(4)}','multiple@test','seller',array['seller','administracion'],true),('${id(5)}','admin@test','admin',array['admin'],true);
      insert into cash_transactions values('${id(10)}','${id(1)}','egreso',100,'ARS','${id(20)}','${id(21)}',null),('${id(11)}','${id(2)}','egreso',100,'ARS','${id(20)}','${id(21)}',null),('${id(12)}','${id(1)}','ingreso',100,'ARS','${id(20)}','${id(21)}',null),('${id(13)}','${id(1)}','egreso',100,'ARS','${id(20)}','${id(21)}','${id(40)}');
      insert into supplier_purchases values('${id(30)}','${id(22)}','ARS'),('${id(31)}','${id(23)}','ARS');
    `);
    const sql = fs.readFileSync('database/db_migration_v142_supplier_payment_access.sql','utf8');
    await db.exec(sql); await db.exec(sql);
    for (const [actor,expected] of [[1,true],[2,false],[3,false],[4,true],[5,true]]) {
      assert.equal((await db.query('select can_manage_financial_operations($1) allowed',[id(actor)])).rows[0].allowed,expected);
    }
    async function payment(actor, overrides = {}) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(actor)]);
      await db.exec('set role authenticated');
      try {
        const p={supplier:22,purchase:null,amount:100,currency:'ARS',account:20,method:21,cash:10,...overrides};
        return await db.query('insert into supplier_payments(supplier_id,purchase_id,amount,currency,financial_account_id,payment_method_id,cash_transaction_id) values($1,$2,$3,$4,$5,$6,$7) returning created_by', [id(p.supplier),p.purchase && id(p.purchase),p.amount,p.currency,id(p.account),id(p.method),id(p.cash)]);
      } finally { await db.exec('reset role'); }
    }
    assert.equal((await payment(1)).rows[0].created_by,id(1));
    await payment(1,{purchase:30});
    for (const [actor,payload] of [[2,{cash:11}],[3,{}],[1,{cash:11}],[1,{cash:12}],[1,{cash:13}],[1,{amount:101}],[1,{currency:'USD'}],[1,{account:99}],[1,{method:99}],[1,{purchase:31}]]) {
      await assert.rejects(payment(actor,payload),e=>e.code==='42501');
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('update supplier_payments set amount=999 returning id')).rows.length,0);
    assert.equal((await db.query('delete from supplier_payments returning id')).rows.length,0);
    await assert.rejects(db.query('select can_manage_financial_operations($1)',[id(1)]),e=>e.code==='42501');
    await db.exec('reset role');
    console.log('PASS finance and multiple roles; inactive/seller denied; matching cash and supplier required; author default; no update/delete grants; RPC restricted; repeatable migration');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
