// Read-only schema and row-count inventory for mapping planning to existing finance data.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: 'payment_planning_inventory' });
  await db.connect();
  try {
    const tables = ['financial_accounts','financial_transactions','cash_transactions','supplier_payments','payment_planning_items','payment_planning_balances'];
    const { rows } = await db.query(`select table_name,column_name,data_type from information_schema.columns
      where table_schema='public' and table_name=any($1) order by table_name,ordinal_position`, [tables]);
    const groups = Object.groupBy(rows, row => row.table_name);
    console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([name, columns]) => [name, columns.map(row => `${row.column_name}:${row.data_type}`)]))));
    for (const name of ['financial_transactions','cash_transactions','payment_planning_items','payment_planning_balances']) {
      if (!groups[name]) continue;
      const { rows: [count] } = await db.query(`select count(*)::integer as n from public.${name}`);
      console.log(JSON.stringify({ table: name, count: count.n }));
    }
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
