const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });

(async () => {
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'");
    const original = (await db.query('select pg_get_functiondef($1::regprocedure) definition',
      ['public.capture_order_cancellation_job()'])).rows[0].definition;
    const migration = fs.readFileSync('database/db_migration_v147_imported_cancellation_notice.sql', 'utf8');
    await db.query(migration.replace(/^begin;\s*/, '').replace(/commit;\s*$/, ''));
    await db.query('savepoint behavior_tests');
    // Run the real trigger on a temporary copy: no real order is modified.
    // Queue changes and pg_net dispatches are rolled back before any commit.
    await db.query(`create temporary table status_scope_test on commit drop as
      select id,seller_id,customer_name,legacy_code,cancel_reason,'Pendiente'::text status
      from public.orders where seller_id is not null limit 1`);
    const order = (await db.query('select * from status_scope_test')).rows[0];
    assert.ok(order, 'An existing order is required for transactional trigger checks');
    await db.query(`create trigger scope_test after update of status on status_scope_test
      for each row execute function public.capture_order_cancellation_job()`);
    const jobs = async () => (await db.query(
      "select * from public.order_sync_jobs where order_id=$1 and kind in ('cancel','reactivate') order by kind", [order.id])).rows;
    await db.query("select set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    await db.query("update status_scope_test set status='Cancelado',cancel_reason='Scope regression test'");
    const importedJobs = await jobs();
    const importedCancellation = importedJobs.find(job => job.kind === 'cancel');
    assert.equal(importedCancellation.status, 'pending');
    assert.equal(importedCancellation.submitted_by, null);
    assert.equal(importedCancellation.payload.source, 'sheet_sync');
    assert.equal(importedCancellation.payload.reason, 'Scope regression test');
    await db.query("update status_scope_test set status='Pendiente'");
    assert.deepEqual(await jobs(), importedJobs, 'Imported reactivation must not write back to Sheets');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [order.seller_id]);
    await db.query("update status_scope_test set status='Cancelado'");
    const cancellation = (await jobs()).find(job => job.kind === 'cancel');
    assert.equal(cancellation.status, 'pending');
    assert.equal(cancellation.submitted_by, order.seller_id);
    assert.equal(cancellation.payload.reason, 'Scope regression test');
    assert.equal(cancellation.payload.source, 'erp');
    const cancelledJobs = await jobs();
    await db.query("update status_scope_test set status='Cancelado'");
    assert.deepEqual(await jobs(), cancelledJobs, 'Unchanged status must not repeat cancellation');
    await db.query("update status_scope_test set status='Pendiente'");
    assert.equal((await jobs()).find(job => job.kind === 'reactivate').status, 'pending');
    await db.query('rollback to savepoint behavior_tests');
    if (apply) {
      const directory = path.join('output', 'order-status-notification-scope-v147');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `before-${Date.now()}.sql`), original);
      await db.query('commit');
      console.log('APPLIED v147: imported cancellations enqueue notice-only jobs; manual cancellations and reactivations still enqueue. All behavioral tests rolled back.');
    } else {
      await db.query('rollback');
      console.log('PASS: imported cancellation/reactivation, manual cancellation/reactivation and unchanged status. All changes rolled back.');
    }
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { await db.end(); }
})().catch(error => { console.error(error.message || error.code || error.name); process.exitCode = 1; });
