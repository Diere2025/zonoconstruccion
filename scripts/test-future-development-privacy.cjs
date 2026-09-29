// Read-only database check of the owner-only RLS policy. No test users or documents are created.
const { Client } = require('pg');
process.loadEnvFile(process.env.ZONO_ENV_FILE || '.env.local');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const owner = '381df0d1-183f-4ccb-aaf2-8147c76159a9';

async function visibleTo(userId) {
  await db.query('begin read only');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    const result = await db.query("select id,slug from public.future_development_documents where slug='plan-modulo-tareas-kanban'");
    return result.rows;
  } finally { await db.query('rollback'); }
}

(async () => {
  await db.connect();
  const another = await db.query('select id from auth.users where id<>$1 limit 1', [owner]);
  if (another.rowCount !== 1) throw new Error('No comparison user exists');
  const ownerRows = await visibleTo(owner);
  const otherRows = await visibleTo(another.rows[0].id);
  if (ownerRows.length !== 1 || otherRows.length !== 0) throw new Error('RLS isolation failed');
  await db.query('begin read only');
  let anonymousDenied = false;
  try {
    await db.query('set local role anon');
    await db.query('select id from public.future_development_documents limit 1');
  } catch (error) { anonymousDenied = error.code === '42501'; }
  finally { await db.query('rollback'); }
  if (!anonymousDenied) throw new Error('Anonymous read was not denied');
  console.log(JSON.stringify({ ownerCanRead: true, otherUserRows: 0, anonymousDenied: true }));
})().catch(error => { console.error('Privacy check failed:', error.code || error.message); process.exitCode = 1; })
  .finally(() => db.end().catch(() => {}));
