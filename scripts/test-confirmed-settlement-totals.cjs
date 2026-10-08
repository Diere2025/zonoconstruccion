// Verification edits always roll back. --apply commits the guard and the
// incident correction only; it never confirms a reopened settlement.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const migration = fs.readFileSync('database/db_migration_v144_confirmed_settlement_totals.sql', 'utf8')
  .replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
const apply = process.argv.includes('--apply');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='3s'; set local statement_timeout='20s'");
    await db.query(migration);
    const s = (await db.query("select * from treasury_settlements where code='REND07126' for update")).rows[0];
    assert(s && s.status === 'draft', 'Incident must remain reopened');
    assert.equal(Number(s.deliveries_total), 864600);
    assert.equal(Number(s.electronic_total), 219600);
    assert.equal(Number(s.counted_cash), 869000);
    const total = (await db.query(`select sum(case when public.settlement_delivery_status(d.status,d.failure_reason)='entregado'
      then greatest(coalesce((o.totals->>'pending_balance')::numeric,o.total_amount),0) else 0 end) amount
      from deliveries d join orders o on o.id=d.order_id where d.route_sheet_id=$1`, [s.route_sheet_id])).rows[0];
    assert.equal(Number(total.amount),1084200, 'Delivered order balances support the correction');
    const movementsBefore = (await db.query('select * from cash_transactions where treasury_settlement_id=$1 order by id',[s.id])).rows;
    await db.query('savepoint verification');
    await db.query("update treasury_settlements set status='confirmed' where id=$1",[s.id]);
    const saved = (await db.query('select * from treasury_settlements where id=$1',[s.id])).rows[0];
    await db.query("update deliveries set status='fallido',failure_reason='postergado' where route_sheet_id=$1 and order_id=(select order_id from treasury_settlement_electronic_tickets where settlement_id=$2 limit 1)",[s.route_sheet_id,s.id]);
    await db.query('update treasury_settlements set updated_at=now() where id=$1',[s.id]);
    const frozen = (await db.query('select * from treasury_settlements where id=$1',[s.id])).rows[0];
    for (const field of ['deliveries_total','electronic_total','expected_cash','difference']) assert.equal(frozen[field], saved[field]);
    await db.query('savepoint forbidden');
    await assert.rejects(db.query('update treasury_settlements set deliveries_total=deliveries_total+1 where id=$1',[s.id]), e => e.code==='23514');
    await db.query('rollback to savepoint forbidden');
    await db.query('select reopen_treasury_settlement($1,$2)',[s.reopened_by,s.id]);
    const reopened = (await db.query('select * from treasury_settlements where id=$1',[s.id])).rows[0];
    assert.equal(reopened.status,'draft');
    assert.equal(reopened.difference,saved.difference,'Reopening preserves the closed balance');
    await db.query('rollback to savepoint verification');
    const corrected = (await db.query(`update treasury_settlements set deliveries_total=1084200,
      expected_cash=1084200+change_fund-tolls_total-extraordinary_total-electronic_total,
      difference=counted_cash+shortage_recovered-(1084200+change_fund-tolls_total-extraordinary_total-electronic_total),
      whatsapp_message='La rendición del 05/10 tiene un sobrante de *$400*. Queda registrada para revisión.',
      updated_at=clock_timestamp() where id=$1 returning *`,[s.id])).rows[0];
    assert.equal(Number(corrected.expected_cash),868600);
    assert.equal(Number(corrected.difference),400);
    assert.equal(corrected.status,'draft');
    await db.query('update route_sheets set total_theoretical_cash=1084200 where id=$1',[s.route_sheet_id]);
    assert.deepEqual((await db.query('select * from cash_transactions where treasury_settlement_id=$1 order by id',[s.id])).rows,movementsBefore);
    await db.query(apply?'commit':'rollback');
    console.log(apply ? 'Applied: confirmed balance protection; REND07126 total $1,084,200, expected $868,600, surplus $400. Status and cash movements preserved.' : 'PASS: synchronization freeze, write rejection, reopening, incident correction and unchanged cash movements (rolled back).');
  } catch(e) { await db.query('rollback'); throw e; }
  finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });
