const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(require.resolve('@electric-sql/pglite', {
  paths: [path.resolve('.codex-tmp/supplier-account-check')]
}));
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table orders(id uuid primary key default gen_random_uuid(), client_id uuid,
        seller_id uuid, status text, payment_status text, total_amount numeric,
        payment_method_id uuid, totals jsonb, created_at timestamptz default now());
      create table cash_transactions(id uuid primary key, operation_id uuid);
      create table client_payments(id uuid primary key default gen_random_uuid(),
        order_id uuid, client_id uuid, amount numeric, currency text, exchange_rate numeric,
        payment_method_id uuid, status text, notes text, receipt_url text,
        created_by uuid, created_at timestamptz, cash_transaction_id uuid);
    `);
    const sql = fs.readFileSync('database/db_migration_v267_unpaid_order_collection_guard.sql', 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(`create trigger sync_payment after insert or update of status, payment_status, totals,
      total_amount on orders for each row execute function sync_order_payment_to_ledger()`);
    const client = '00000000-0000-0000-0000-000000000001';
    const method = '00000000-0000-0000-0000-000000000002';
    const terms = { payment_timing: 'contra_entrega', deposit_amount: 0, pending_balance: 245000,
      payments_breakdown: [{ amount: 245000, payment_method_id: method, notes: '', receipt_url: '' }] };
    const create = async (state, totals = terms) => (await db.query(`insert into orders
      (client_id,payment_method_id,status,payment_status,total_amount,totals)
      values ($1,$2,'Pendiente',$3,245000,$4) returning id`, [client, method, state, totals])).rows[0].id;
    const payments = async id => (await db.query('select * from client_payments where order_id=$1', [id])).rows;
    const unpaid = await create('Pendiente');
    assert.equal((await payments(unpaid)).length, 0);
    for (const status of ['Cancelado', 'Pendiente', 'Confirmado', 'Pendiente']) {
      await db.query('update orders set status=$2,totals=totals where id=$1', [unpaid, status]);
      assert.equal((await payments(unpaid)).length, 0, 'reactivation and resync cannot create a collection');
    }
    const partial = await create('Seniado', { ...terms, payment_timing: 'partial', deposit_amount: 50000 });
    assert.equal((await payments(partial)).length, 1);
    assert.equal(Number((await payments(partial))[0].amount), 50000);
    await db.query('update orders set totals=totals where id=$1', [partial]);
    assert.equal((await payments(partial)).length, 1);
    const paid = await create('Abonado');
    assert.equal(Number((await payments(paid))[0].amount), 245000);
    const legacyPaid = await create('Abonado', {});
    assert.equal(Number((await payments(legacyPaid))[0].amount), 245000);
    // Historical suspect rows are not silently deleted by the prevention fix.
    await db.query(`insert into client_payments(order_id,amount,status,notes) values($1,245000,'Aprobado','')`, [unpaid]);
    await db.query('update orders set totals=totals where id=$1', [unpaid]);
    assert.equal((await payments(unpaid)).length, 1);
    // The financial-operation guard remains effective.
    const cash = '00000000-0000-0000-0000-000000000003';
    await db.query('insert into cash_transactions values($1,$1)', [cash]);
    await db.query('update client_payments set cash_transaction_id=$2 where order_id=$1', [unpaid, cash]);
    await assert.rejects(db.query("update orders set payment_status='Abonado' where id=$1", [unpaid]), /Movimientos/);
    await db.exec("set zono.financial_write='on'");
    const managed = await create('Abonado');
    assert.equal((await payments(managed)).length, 0);
    console.log('PASS: unpaid creation/reactivation/resync, partial deposit, paid legacy/breakdown, historical rows and financial guards.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
