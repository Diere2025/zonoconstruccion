// Read-only incident inspection; credentials are never printed.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('begin read only');
    const settlement = (await db.query("select * from treasury_settlements where code=$1", ['REND07126'])).rows;
    console.log(JSON.stringify({ settlement }, null, 2));
    const tables = await db.query(`select table_name from information_schema.tables where table_schema='public'
      and (table_name ilike '%audit%' or table_name ilike '%log%')`);
    console.log(JSON.stringify({tables:tables.rows},null,2));
    if (settlement[0]?.route_sheet_id) {
      const deliveries = await db.query(`select d.id,d.status,d.failure_reason,o.legacy_code,o.total_amount,o.payment_status,
        o.totals->>'pending_balance' pending_balance, o.totals->>'deposit_amount' deposit_amount
        from deliveries d join orders o on o.id=d.order_id where d.route_sheet_id=$1`, [settlement[0].route_sheet_id]);
      console.log(JSON.stringify({deliveries:deliveries.rows},null,2));
      console.log(JSON.stringify({tickets:(await db.query('select * from treasury_settlement_electronic_tickets where settlement_id=$1',[settlement[0].id])).rows,
        route:(await db.query('select id,total_theoretical_cash,status from route_sheets where id=$1',[settlement[0].route_sheet_id])).rows},null,2));
    }
  } finally { await db.query('rollback'); await db.end(); }
})().catch(e => { console.error(e.code || e.message); process.exitCode=1; });
