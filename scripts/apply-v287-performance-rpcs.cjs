const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
let databaseUrl = '';
for (const line of envContent.split(/\r?\n/)) {
  if (line.startsWith('DATABASE_URL=')) {
    databaseUrl = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
}
if (!databaseUrl) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'database', 'db_migration_v287_phase2_performance_rpcs.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const t0 = Date.now();
    await client.query(sql);
    console.log(`Migration v287 applied in ${Date.now() - t0}ms`);

    console.log('\n=== BENCHMARKING PHASE 2 RPCs ===');

    let s = Date.now();
    const nextCode = await client.query(`SELECT public.get_next_legacy_code('JS') AS code`);
    console.log(`1. get_next_legacy_code('JS') -> ${nextCode.rows[0].code} (${Date.now() - s}ms)`);

    s = Date.now();
    const clientsDefault = await client.query(`SELECT count(*)::int AS cnt FROM public.get_clients_with_stats(NULL, 'all', false, 100)`);
    console.log(`2a. get_clients_with_stats(default, 100) -> ${clientsDefault.rows[0].cnt} rows (${Date.now() - s}ms)`);

    s = Date.now();
    const clientsSearch = await client.query(`SELECT count(*)::int AS cnt FROM public.get_clients_with_stats('garcia', 'all', false, 100)`);
    console.log(`2b. get_clients_with_stats('garcia', 100) -> ${clientsSearch.rows[0].cnt} rows (${Date.now() - s}ms)`);

    s = Date.now();
    const clientsPending = await client.query(`SELECT count(*)::int AS cnt FROM public.get_clients_with_stats(NULL, 'pending_balance', false, 100)`);
    console.log(`2c. get_clients_with_stats(pending_balance) -> ${clientsPending.rows[0].cnt} rows (${Date.now() - s}ms)`);

    s = Date.now();
    const commIds = await client.query(`SELECT count(*)::int AS cnt FROM public.get_commission_order_ids('2026-10-01', '2026-10-31')`);
    console.log(`3. get_commission_order_ids('2026-10-01', '2026-10-31') -> ${commIds.rows[0].cnt} orders (${Date.now() - s}ms)`);

    s = Date.now();
    const balInput = await client.query(`SELECT public.get_client_account_balances_input(true) AS payload`);
    const p = balInput.rows[0].payload;
    console.log(`4. get_client_account_balances_input() -> ${p.clients.length} clients, ${p.orders.length} credit orders, ${p.payments.length} payments, settledWithoutLinked=${p.settledWithoutLinkedPayment} (${Date.now() - s}ms)`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
