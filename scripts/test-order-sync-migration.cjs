// Usage: node scripts/test-order-sync-migration.cjs <env-file>
// All test orders, jobs, scheduled requests and schema changes are rolled back.
const fs = require('fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');

async function main() {
  const env = fs.readFileSync(process.argv[2], 'utf8');
  const entry = env.split(/\r?\n/).find(line => line.startsWith('DATABASE_URL='));
  const db = new Client({ connectionString: entry.slice(13).replace(/^["']|["']$/g, ''), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query(fs.readFileSync('database/db_migration_v74_order_sync_inbox.sql','utf8').replace(/commit;\s*$/, ''));
    const sellers = (await db.query("select id from public.sellers where role is distinct from 'admin' limit 2")).rows;
    assert.equal(sellers.length, 2);
    const insert = `insert into public.orders(seller_id,customer_name,locality,address,freight_type,initial_delivery_date,max_delivery_date,totals)
      values($1,'TEST TRANSACCIONAL COLA','TEST','TEST','Flete Regular',current_date,current_date,$2) returning id`;
    const payload = { integration_payload: { order: { clientName:'TEST TRANSACCIONAL COLA',items:[] } } };
    const first = (await db.query(insert,[sellers[0].id, payload])).rows[0].id;
    const second = (await db.query(insert,[sellers[1].id, payload])).rows[0].id;
    assert.equal((await db.query('select status from public.order_sync_jobs where order_id=$1',[first])).rows[0].status, 'awaiting_items');
    assert.equal((await db.query('select * from public.claim_order_sync_job()')).rows.length,0);
    for (const id of [first,second]) await db.query("insert into public.order_items(order_id,product_name,quantity,unit_price) values($1,'TEST',1,0)",[id]);
    assert.equal((await db.query("select count(*)::int as count from public.order_sync_jobs where status='pending'")).rows[0].count,2);
    const claimed = (await db.query('select * from public.claim_order_sync_job()')).rows;
    assert.equal(claimed.length,1);
    assert.equal((await db.query('select * from public.claim_order_sync_job()')).rows.length,0);
    await db.query("update public.order_sync_jobs set started_at=now()-interval '11 minutes' where id=$1",[claimed[0].id]);
    assert.equal((await db.query('select * from public.claim_order_sync_job()')).rows.length,1);
    assert.equal((await db.query('select status from public.order_sync_jobs where id=$1',[claimed[0].id])).rows[0].status,'attention');
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[sellers[0].id]);
    const visible = (await db.query('select id,seller_id from public.order_sync_jobs')).rows;
    assert.equal(visible.length,1);
    assert.equal(visible[0].seller_id,sellers[0].id);
    await db.query('select public.mark_order_sync_read($1)',[visible[0].id]);
    assert.ok((await db.query('select read_at from public.order_sync_jobs where id=$1',[visible[0].id])).rows[0].read_at);
    await db.query('savepoint restricted');
    await assert.rejects(db.query('select payload from public.order_sync_jobs'), /permission denied/);
    await db.query('rollback to savepoint restricted');
    await assert.rejects(db.query('select * from public.claim_order_sync_job()'), /permission denied/);
    await db.query('rollback to savepoint restricted');
    await assert.rejects(db.query('select secret from public.order_sync_worker_config'), /permission denied/);
    console.log('PASS: atomic outbox, products gate, serialized claims, stale recovery, seller isolation, mark read and restricted worker permissions.');
  } finally {
    await db.query('rollback');
    await db.end();
    console.log('Test transaction rolled back; no orders or notifications were published.');
  }
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
