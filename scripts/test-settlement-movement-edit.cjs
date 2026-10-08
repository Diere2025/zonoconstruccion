// All movement edits and the policy rehearsal are rolled back. --apply commits
// only the policy after testing it, never the verification edits.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const migration = fs.readFileSync('database/db_migration_v127_settlement_movement_edit.sql', 'utf8')
  .replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
const apply = process.argv.includes('--apply');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='3s'; set local statement_timeout='20s'");
    await db.query(migration);
    await db.query('savepoint verification');
    const actor = (await db.query(`select s.id from sellers s
      where s.full_name ilike '%Laura%' and s.is_active and s.role='administracion'
        and public.can_manage_treasury_settlements(s.id)
      limit 1`)).rows[0];
    assert(actor, 'Laura must have active treasury management access');
    const ordinary = (await db.query(`select s.id from sellers s join auth.users u on u.id=s.id
      where s.is_active and not public.can_manage_treasury_settlements(s.id)
        and s.role='seller' limit 1`)).rows[0];
    assert(ordinary, 'A seller without treasury access is required');
    const tx = (await db.query(`select id,created_at,concept,amount,category,sub_category,notes
      from cash_transactions where treasury_settlement_id is not null limit 1`)).rows[0];
    assert(tx, 'A movement linked to a rendition is required');
    const otherTx = (await db.query('select id from cash_transactions where treasury_settlement_id is null limit 1')).rows[0];
    assert(otherTx, 'An unrelated cash movement is required');
    const asActor = async id => {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: 'authenticated' })]);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
      await db.query('set local role authenticated');
    };
    await asActor(actor.id);
    const edited = await db.query(`update cash_transactions set
      created_at=created_at-interval '1 day', concept='TEST ROLLBACK',
      amount=amount+1, category='TEST', sub_category='TEST', notes='TEST'
      where id=$1 returning created_at,concept,amount,category,sub_category,notes`, [tx.id]);
    assert.equal(edited.rowCount, 1, 'Laura can update a rendition movement');
    assert.equal(edited.rows[0].concept, 'TEST ROLLBACK');
    assert.equal(Number(edited.rows[0].amount), Number(tx.amount) + 1);
    assert.equal(edited.rows[0].created_at.getTime(), tx.created_at.getTime() - 86400000);
    assert.equal(edited.rows[0].category, 'TEST');
    assert.equal(edited.rows[0].sub_category, 'TEST');
    assert.equal(edited.rows[0].notes, 'TEST');
    assert.equal((await db.query('update cash_transactions set concept=concept where id=$1 returning id', [otherTx.id])).rowCount, 0,
      'This permission does not authorize unrelated movements');
    await db.query('savepoint forbidden_unlink');
    await assert.rejects(() => db.query('update cash_transactions set treasury_settlement_id=null where id=$1', [tx.id]),
      error => error.code === '42501');
    await db.query('rollback to savepoint forbidden_unlink');
    await asActor(ordinary.id);
    assert.equal((await db.query('update cash_transactions set concept=concept where id=$1 returning id', [tx.id])).rowCount, 0,
      'Sellers cannot edit rendition movements');
    await db.query('reset role');
    const confirmed = (await db.query("select id,to_jsonb(s) snapshot from treasury_settlements s where status='confirmed' limit 1")).rows[0];
    assert(confirmed, 'A confirmed rendition is required');
    const beforeMoves = (await db.query('select to_jsonb(t) snapshot from cash_transactions t where treasury_settlement_id=$1 order by id', [confirmed.id])).rows;
    const reopened = (await db.query('select to_jsonb(public.reopen_treasury_settlement($1,$2)) result', [actor.id, confirmed.id])).rows[0].result;
    assert.equal(reopened.status, 'draft');
    assert.equal(reopened.reopened_by, actor.id);
    assert(reopened.reopened_at);
    for (const [key, value] of Object.entries(confirmed.snapshot)) {
      if (!['status', 'updated_at', 'reopened_at', 'reopened_by'].includes(key)) assert.deepEqual(reopened[key], value, `Reopening preserves ${key}`);
    }
    assert.deepEqual((await db.query('select to_jsonb(t) snapshot from cash_transactions t where treasury_settlement_id=$1 order by id', [confirmed.id])).rows, beforeMoves,
      'Reopening does not change generated movements');
    const save = {
      p_actor_id: actor.id, p_settlement_id: confirmed.id, p_code: reopened.code,
      p_settlement_date: '2026-09-01', p_carrier_name: reopened.carrier_name,
      p_route_detail: 'TEST ROLLBACK', p_deliveries_total: 100, p_electronic_total: 0,
      p_change_fund: 0, p_shortage_recovered: 0, p_notes: 'Corrección de Laura',
      p_whatsapp_message: '', p_count_date: '2026-09-02', p_counted_cash_override: 95,
      p_expenses: [{ expense_type: 'toll', amount: 5, reference: 'Peaje corregido', sort_order: 0 }],
      p_cash_counts: [], p_confirm: false, p_electronic_tickets: [],
    };
    const saved = (await db.query('select to_jsonb(public.save_treasury_settlement_with_orders($1,$2)) result', [JSON.stringify(save), '[]'])).rows[0].result;
    assert.equal(saved.settlement_date, save.p_settlement_date);
    assert.equal(saved.count_date, save.p_count_date);
    assert.equal(saved.notes, save.p_notes);
    assert.equal(saved.route_detail, save.p_route_detail);
    assert.equal(Number(saved.tolls_total), 5);
    assert.equal(Number(saved.counted_cash), 95);
    save.p_confirm = true;
    const reconfirmed = (await db.query('select to_jsonb(public.save_treasury_settlement_with_orders($1,$2)) result', [JSON.stringify(save), '[]'])).rows[0].result;
    assert.equal(reconfirmed.status, 'confirmed');
    assert.deepEqual((await db.query('select to_jsonb(t) snapshot from cash_transactions t where treasury_settlement_id=$1 order by id', [confirmed.id])).rows, beforeMoves);
    async function rejectsWithoutChanges(fn, code) {
      await db.query('savepoint rejected_reopen');
      await assert.rejects(fn, error => error.code === code);
      await db.query('rollback to savepoint rejected_reopen');
    }
    await rejectsWithoutChanges(() => db.query('select public.reopen_treasury_settlement($1,$2)', [ordinary.id, confirmed.id]), '42501');
    const archived = (await db.query("select id from treasury_settlements where status='archived' limit 1")).rows[0];
    assert(archived);
    await rejectsWithoutChanges(() => db.query('select public.reopen_treasury_settlement($1,$2)', [actor.id, archived.id]), '23514');
    await db.query('rollback to savepoint verification');
    const unchanged = (await db.query('select created_at,concept,amount,category,sub_category,notes from cash_transactions where id=$1', [tx.id])).rows[0];
    const { id, ...original } = tx;
    assert.deepEqual(unchanged, original, 'Verification edits were rolled back');
    await db.query(apply ? 'commit' : 'rollback');
    console.log(`Settlement movement editing verified for Laura; policy ${apply ? 'applied' : 'rolled back'}. Verification edits rolled back.`);
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
