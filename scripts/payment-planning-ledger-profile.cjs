// Read-only inventory of existing financial accounts and movement timing.
const { Client } = require('pg');
process.loadEnvFile('.env.local');
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: 'payment_planning_ledger_profile' });
  await db.connect();
  try {
    const accounts = await db.query(`select a.id,a.name,a.type,a.currency,a.is_active,count(t.id)::integer as movements
      from public.financial_accounts a left join public.cash_transactions t on t.financial_account_id=a.id
        and coalesce(t.registered_at,t.created_at) >= '2026-09-28'::timestamptz
        and coalesce(t.registered_at,t.created_at) < '2026-10-02'::timestamptz
      group by a.id order by a.name`);
    const movements = await db.query(`select (coalesce(registered_at,created_at) at time zone 'America/Argentina/Buenos_Aires')::date::text as day,
      type,currency,count(*)::integer as count,round(sum(amount),2) as amount
      from public.cash_transactions where coalesce(registered_at,created_at) >= '2026-09-28'::timestamptz
        and coalesce(registered_at,created_at) < '2026-10-02'::timestamptz
      group by 1,2,3 order by 1,2,3`);
    console.log(JSON.stringify({ accounts: accounts.rows, movements: movements.rows }));
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
