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

const sqlPath = path.join(__dirname, '..', 'database', 'db_migration_v286_historical_performance_indexes_rls.sql');
const rawSql = fs.readFileSync(sqlPath, 'utf8');

function splitStatements(sql) {
  const withoutLineComments = sql
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  return withoutLineComments
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function explainQuery(client, label, sql) {
  const res = await client.query(`EXPLAIN (ANALYZE, FORMAT TEXT) ${sql}`);
  const lines = res.rows.map(r => r['QUERY PLAN']);
  const execLine = lines.find(l => l.startsWith('Execution Time:')) || '';
  const topPlan = lines[0] || '';
  const scanLine = lines.find(l => /Scan|Index|Seq Scan/.test(l)) || '';
  console.log(`  [${label}] ${execLine} | ${scanLine.trim() || topPlan.trim()}`);
}

async function runBenchmarks(client, phase) {
  console.log(`\n=== BENCHMARK (${phase}) ===`);
  await explainQuery(
    client,
    'clients ILIKE search',
    `SELECT id, business_name, phone_primary FROM public.clients
     WHERE business_name ILIKE '%garcia%' OR phone_primary ILIKE '%1155%' OR tax_id ILIKE '%3071%'
     LIMIT 50`
  );
  await explainQuery(
    client,
    'orders non-historical page',
    `SELECT id, legacy_code, customer_name, order_date FROM public.orders
     WHERE (totals -> 'importacion_historica') IS NULL
     ORDER BY order_date DESC, created_at DESC
     LIMIT 50`
  );
  await explainQuery(
    client,
    'deliveries active routing',
    `SELECT id, order_id, delivery_date, run_number, delivery_order FROM public.deliveries
     WHERE status NOT IN ('entregado', 'fallido')
     ORDER BY delivery_date ASC, run_number ASC, delivery_order ASC`
  );
  await explainQuery(
    client,
    'order_items orphans group',
    `SELECT product_name, count(*) FROM public.order_items
     WHERE product_id IS NULL
     GROUP BY product_name
     LIMIT 50`
  );
}

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    // Allow concurrent index builds enough time on 100k-260k row tables
    await client.query(`SET statement_timeout = '10min'`);

    await runBenchmarks(client, 'BEFORE');

    const statements = splitStatements(rawSql);
    console.log(`\n=== APPLYING ${statements.length} STATEMENTS ===`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 90);
      const start = Date.now();
      await client.query(stmt);
      console.log(`  [${String(i + 1).padStart(2, '0')}/${statements.length}] ${Date.now() - start}ms — ${preview}`);
    }

    await runBenchmarks(client, 'AFTER');

    console.log('\n=== VERIFY INVALID INDEXES ===');
    const invalid = await client.query(`
      SELECT c.relname AS index_name
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE NOT i.indisvalid
    `);
    console.log('Invalid indexes:', invalid.rows.length ? invalid.rows : 'NONE (all valid)');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
