const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require(require.resolve('@electric-sql/pglite',{paths:[path.resolve('.codex-tmp/supplier-account-check')]}));

const id = number => '00000000-0000-4000-8000-'+String(number).padStart(12,'0');
const migration = fs.readFileSync('database/db_migration_v270_crypto_reconciliation.sql','utf8');

test('P2P, Redot and ad balances reconcile without posting duplicate bank movements', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create function can_manage_financial_operations(actor uuid) returns boolean
        language sql stable as $$select actor = '${id(1)}'::uuid$$;
      create table financial_operations (id uuid primary key, status text);
      create table financial_accounts (id uuid primary key, name text);
      create table cash_transactions (
        id uuid primary key, movement_code text unique, type text, amount numeric, currency text,
        financial_account_id uuid, operation_id uuid, reversal_of_transaction_id uuid
      );
      insert into financial_accounts values ('${id(2)}','Banco');
      insert into cash_transactions values ('${id(3)}','PAG-0000000003','egreso',150000,'ARS','${id(2)}',null,null);
    `);
    await db.exec(migration);
    const save = (number,entry,actor=id(1)) => db.query(
      'select save_crypto_reconciliation_entry($1,$2,$3)',[actor,id(number),{day:'2024-10-13',reference:'ref-'+number,...entry}],
    );
    const read = async () => (await db.query('select read_crypto_reconciliation($1,0) as result',[id(1)])).rows[0].result;
    const voidEntry = (number,reason) => db.query('select void_crypto_reconciliation_entry($1,$2,$3)',[id(1),id(number),reason]);
    const p2p = {kind:'p2p',wallet:'binance',amount:'100.00000001',bank_code:'PAG-0000000003',bank_amount:'150000'};
    await assert.rejects(save(4,p2p,id(99)),/permisos/);
    await assert.rejects(save(4,{...p2p,bank_amount:'1'}),/importe/);
    await save(4,p2p);
    await save(4,p2p);
    await assert.rejects(save(4,{...p2p,amount:'101'}),/otros datos/);
    await assert.rejects(save(5,p2p),/ya están registrados/);
    await save(6,{kind:'opening',wallet:'binance',amount:'0'});
    await assert.rejects(save(12,{kind:'opening',wallet:'binance',amount:'0'}),/ya están registrados/);
    await assert.rejects(save(7,{kind:'transfer',wallet:'binance',amount:'40',credited:'40.00000001'}),/máximo/);
    await save(7,{kind:'transfer',wallet:'binance',amount:'40.00000001',credited:'39.5'});
    await save(8,{kind:'ad_funding',wallet:'binance',amount:'60',credited:'58'});
    await save(9,{kind:'ad_spend',wallet:'ads',amount:'50.40'});
    await save(10,{kind:'service',wallet:'redot',amount:'12.12345678',original_amount:'10.99',original_currency:'USD'});
    await assert.rejects(save(11,{kind:'personal',wallet:'redot',amount:'12.12345678',reference:'REF-10'}),/ya están registrados/);

    const report = await read();
    assert.equal(report.entries.length,6);
    assert.equal(report.entries.find(entry => entry.id === id(7)).transfer_fee,'0.50000001');
    assert.equal(report.entries.find(entry => entry.id === id(4)).bank_matches,true);
    assert.deepEqual(report.balances,{
      binance:{amount:'0.00000000',hasOpening:true},
      redot:{amount:'27.37654322',hasOpening:false},
      ads:{amount:'7.60',hasOpening:false},
    });
    await voidEntry(10,'Cargo duplicado');
    await voidEntry(10,'Cargo duplicado');
    assert.equal((await read()).entries.find(entry => entry.id === id(10)).void_reason,'Cargo duplicado');
    assert.equal((await read()).balances.redot.amount,'39.5');
    assert.equal((await db.query('select count(*)::int as count from cash_transactions')).rows[0].count,1);

    await db.query('update cash_transactions set amount = 100 where id = $1',[id(3)]);
    assert.equal((await read()).entries.find(entry => entry.id === id(4)).bank_matches,false);
    await db.query('delete from cash_transactions where id = $1',[id(3)]);
    await save(4,p2p);
    const detached = (await read()).entries.find(entry => entry.id === id(4));
    assert.equal(detached.bank_code,'PAG-0000000003');
    assert.equal(detached.bank_transaction_id,null);
    assert.equal(detached.bank_matches,false);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select read_crypto_reconciliation($1,0)',[id(1)]),/permission denied/);
    await assert.rejects(db.query('select * from crypto_reconciliation_entries'),/permission denied/);
  } finally {
    await db.close();
  }
});
