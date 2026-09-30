// Read-only audit of planning items through 29/09/2026.
const { Client } = require('pg');
process.loadEnvFile('.env.local');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: 'payment_planning_historical_audit' });
  await db.connect();
  try {
    const { rows } = await db.query(`
      select i.id, i.scheduled_date::text as date, i.status, i.kind,
             f.name as fund, i.title, i.amount, i.closed_amount,
             coalesce(sum(r.amount) filter (where r.reversed_at is null), 0) as realized,
             count(r.id) filter (where r.reversed_at is null and r.cash_transaction_id is not null)::int as linked
      from public.payment_planning_items i
      join public.payment_planning_funds f on f.id = i.fund_id
      left join public.payment_planning_realizations r on r.item_id = i.id
      where i.scheduled_date <= date '2026-09-29'
      group by i.id, f.name
      order by i.scheduled_date, i.status, i.title
    `);
    const summary = {};
    for (const row of rows) {
      const key = `${row.status}:${row.kind}`;
      const group = summary[key] ||= { total: 0, outstanding: 0, missingAmount: 0, linked: 0 };
      group.total++;
      if (row.amount === null) group.missingAmount++;
      else if (Number(row.amount) > Number(row.realized) + Number(row.closed_amount || 0)) group.outstanding++;
      if (row.linked) group.linked++;
    }
    console.log(JSON.stringify({ through: '2026-09-29', summary, outstandingActive: rows.filter(row => row.status === 'active' && row.amount !== null && Number(row.amount) > Number(row.realized) + Number(row.closed_amount || 0)) }, null, 2));
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
