const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/treasuryTransactionTime.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exported, Date, Intl });
const { treasuryToday, treasuryDateTime, compareTreasuryTransactions } = exported;
assert.equal(treasuryToday(new Date('2026-09-29T01:10:00Z')), '2026-09-28');
assert.equal(treasuryDateTime('2026-09-20', new Date('2026-09-29T01:10:20.123Z')), '2026-09-21T01:10:20.123Z');
assert.throws(() => treasuryDateTime('2026-02-30'));
const movements = [
  { id: 'a', created_at: '2026-09-28T15:00:00Z', registered_at: '2026-09-28T20:00:00Z' },
  { id: 'b', created_at: '2026-09-28T15:00:00Z', registered_at: '2026-09-28T21:00:00Z' },
  { id: 'c', created_at: '2026-09-29T01:00:00Z', registered_at: '2026-09-29T01:00:00Z' },
  { id: 'd', created_at: '2026-09-27T15:00:00Z', registered_at: '2026-09-30T15:00:00Z' },
];
assert.equal(movements.sort(compareTreasuryTransactions).reverse().map(m => m.id).join(','), 'c,b,a,d');
assert(compareTreasuryTransactions({ id: 'a', created_at: movements[0].created_at }, { id: 'b', created_at: movements[0].created_at }) < 0);
console.log('Treasury dates and ordering passed.');

// Optional integration check: all DDL, movement inserts, balance changes and
// settlement saves are rolled back. No lasting changes are made to the database.
async function databaseTest() {
  const { Client } = require('pg');
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
  assert(line, 'DATABASE_URL is required for the integration check');
  const db = new Client({ connectionString: line.slice(13).replace(/^["']|["']$/g, ''), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query("set lock_timeout = '3s'; set statement_timeout = '20s'");
    await db.query(fs.readFileSync('database/db_migration_v104_treasury_movement_generation.sql', 'utf8').replace(/commit;\s*$/, ''));
    const actor = (await db.query('select id from auth.users where public.can_manage_treasury_settlements(id) limit 1')).rows[0].id;
    const account = (await db.query('select id, currency from public.financial_accounts where is_active limit 1')).rows[0];
    const payment = (await db.query('select id from public.payment_methods limit 1')).rows[0].id;
    const settlement = (await db.query("insert into public.treasury_settlements(code, settlement_date, carrier_name, created_by) values ('TEST-' || gen_random_uuid(), current_date, 'TEST ROLLBACK', $1) returning id", [actor])).rows[0].id;
    const movement = { type: 'ingreso', category: 'Recaudación', sub_category: 'Venta - Recorridos', amount: 1, currency: account.currency, payment_method_id: payment, financial_account_id: account.id, concept: 'TEST ROLLBACK', business_unit: 'ZONO', created_at: new Date().toISOString() };
    const generate = async (mode, ids, rows = [movement]) => (await db.query('select public.generate_treasury_settlement_movements($1,$2,$3,$4,$5) result', [actor, settlement, mode, ids, JSON.stringify(rows)])).rows[0].result;
    async function rejectsWithoutChanges(fn, pattern) {
      await db.query('savepoint test_error');
      await assert.rejects(fn, pattern);
      await db.query('rollback to savepoint test_error');
    }
    const first = await generate('initial', []);
    assert.equal(first.length, 1);
    await rejectsWithoutChanges(() => generate('initial', []), /cambiaron/);
    await rejectsWithoutChanges(() => generate('initial', [first[0].id]), /ya fueron generados/);
    const second = await generate('duplicate', [first[0].id]);
    const replaced = await generate('replace', [first[0].id, second[0].id]);
    assert.equal((await db.query('select count(*)::int n from public.cash_transactions where treasury_settlement_id=$1', [settlement])).rows[0].n, 1);
    await rejectsWithoutChanges(() => generate('replace', [replaced[0].id], [{ ...movement, financial_account_id: '00000000-0000-0000-0000-000000000000' }]), /foreign key/);
    assert.equal((await db.query('select id from public.cash_transactions where treasury_settlement_id=$1', [settlement])).rows[0].id, replaced[0].id, 'A failed replacement must retain the original movement');
    assert((await db.query('select movements_generated_at from public.treasury_settlements where id=$1', [settlement])).rows[0].movements_generated_at);
    const save = { p_actor_id: actor, p_settlement_id: settlement, p_code: 'TEST', p_settlement_date: '2026-09-28', p_carrier_name: 'TEST ROLLBACK', p_deliveries_total: 100, p_electronic_total: 0, p_change_fund: 0, p_shortage_recovered: 0, p_counted_cash_override: 100, p_expenses: [], p_cash_counts: [], p_confirm: false, p_electronic_tickets: [] };
    const saved = (await db.query('select to_jsonb(public.save_treasury_settlement_with_orders($1,$2)) result', [JSON.stringify(save), '[]'])).rows[0].result;
    assert.equal(Number(saved.counted_cash), 100);
    assert(saved.movements_generated_at, 'Saving must preserve generation history');
    await rejectsWithoutChanges(() => db.query('select public.save_treasury_settlement_with_orders($1,$2)', [JSON.stringify(save), JSON.stringify([{ deliveryId: '00000000-0000-0000-0000-000000000000', status: 'entregado' }])]), /no pertenece/);
    const routed = (await db.query(`select s.id, s.code, s.settlement_date, s.carrier_name, s.route_sheet_id, s.deliveries_total,
      d.id delivery_id from public.treasury_settlements s join public.deliveries d on d.route_sheet_id=s.route_sheet_id
      where s.status='draft' limit 1`)).rows[0];
    assert(routed, 'A draft rendition with deliveries is required for the delivery persistence check');
    const routedSave = { ...save, p_settlement_id: routed.id, p_code: routed.code, p_settlement_date: treasuryToday(routed.settlement_date), p_carrier_name: routed.carrier_name, p_deliveries_total: Number(routed.deliveries_total) };
    await db.query('select public.save_treasury_settlement_with_orders($1,$2)', [JSON.stringify(routedSave), JSON.stringify([{ deliveryId: routed.delivery_id, status: 'postergado' }])]);
    const delivered = (await db.query('select status, failure_reason from public.deliveries where id=$1', [routed.delivery_id])).rows[0];
    assert.equal(delivered.status, 'fallido');
    assert.equal(delivered.failure_reason, 'postergado');
    const wrongRoute = (await db.query('select id from public.deliveries where route_sheet_id <> $1 limit 1', [routed.route_sheet_id])).rows[0];
    if (wrongRoute) await rejectsWithoutChanges(() => db.query('select public.save_treasury_settlement_with_orders($1,$2)', [JSON.stringify(routedSave), JSON.stringify([{ deliveryId: wrongRoute.id, status: 'entregado' }])]), /no pertenece/);
    console.log('Database migration, duplicate protection, replacement rollback and settlement/delivery persistence passed.');
  } finally {
    await db.query('rollback');
    await db.end();
  }
}
if (process.argv.includes('--database')) databaseTest().catch(error => { console.error(error.message || error.code || error.name); process.exitCode = 1; });
