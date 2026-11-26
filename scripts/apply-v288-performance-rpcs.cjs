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

const sqlPath = path.join(__dirname, '..', 'database', 'db_migration_v288_phase3_performance_rpcs.sql');
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
    console.log(`Migration v288 applied in ${Date.now() - t0}ms`);

    console.log('\n=== BENCHMARKING PHASE 3 RPCs ===');
    let s = Date.now();
    const sold = await client.query(`SELECT count(*)::int AS cnt FROM public.get_sold_product_ids_since((current_date - 120)::date)`);
    console.log(`1. get_sold_product_ids_since(120d) -> ${sold.rows[0].cnt} products (${Date.now() - s}ms)`);

    s = Date.now();
    const daily = await client.query(`SELECT count(*)::int AS cnt FROM public.get_daily_orders_totals('2026-10-01', '2026-10-31')`);
    console.log(`2. get_daily_orders_totals(Oct 2026) -> ${daily.rows[0].cnt} days (${Date.now() - s}ms)`);

    s = Date.now();
    const sellers = await client.query(`SELECT count(*)::int AS cnt FROM public.get_seller_order_counts()`);
    console.log(`3. get_seller_order_counts() -> ${sellers.rows[0].cnt} sellers (${Date.now() - s}ms)`);

    s = Date.now();
    const orphans = await client.query(`SELECT count(*)::int AS cnt FROM public.get_orphan_order_items_summary()`);
    console.log(`4. get_orphan_order_items_summary() -> ${orphans.rows[0].cnt} distinct orphan names (${Date.now() - s}ms)`);

    s = Date.now();
    const cap = await client.query(`SELECT count(*)::int AS cnt FROM public.get_capital_estancado_sales((current_date - 90)::date)`);
    console.log(`5. get_capital_estancado_sales(90d, first page) -> ${cap.rows[0].cnt} items (${Date.now() - s}ms)`);

    s = Date.now();
    const rent = await client.query(`SELECT count(*)::int AS cnt FROM public.get_rentabilidad_order_items('2026-10-01', '2026-10-31')`);
    console.log(`6. get_rentabilidad_order_items(Oct 2026, first page) -> ${rent.rows[0].cnt} items (${Date.now() - s}ms)`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
