// Install the private document schema and seed a local Markdown plan. Read-only unless --apply is passed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const envFile = process.env.ZONO_ENV_FILE || '.env.local';
process.loadEnvFile(envFile);
const ownerId = '381df0d1-183f-4ccb-aaf2-8147c76159a9';
const slug = 'plan-modulo-tareas-kanban';
const source = process.argv.find(arg => arg.startsWith('--source='))?.slice('--source='.length);
const applying = process.argv.includes('--apply');
const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });

(async () => {
  if (!source) throw new Error('Pass --source=absolute-path-to-plan.md');
  const absolute = path.resolve(source);
  const content = fs.readFileSync(absolute, 'utf8');
  if (!content.startsWith('# Módulo independiente de Tareas') || content.length > 200000)
    throw new Error('Unexpected plan content or size');
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  await db.connect();
  const owner = await db.query(`select u.id, s.is_active from auth.users u
    join public.sellers s on s.id=u.id where u.id=$1 and lower(u.email)='diego.boveda@gmail.com'`, [ownerId]);
  if (owner.rowCount !== 1 || owner.rows[0].is_active !== true) throw new Error('Owner verification failed');
  const schema = await db.query("select to_regclass('public.future_development_documents') as name");
  console.log(JSON.stringify({ ownerVerified: true, schemaExists: Boolean(schema.rows[0].name), sourceBytes: Buffer.byteLength(content), sourceSha256: hash, applying }));
  if (!applying) return;
  if (!schema.rows[0].name) {
    await db.query(fs.readFileSync('database/db_migration_v115_future_developments.sql', 'utf8'));
  }
  await db.query('begin');
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='30s'");
  await db.query(`insert into public.future_development_documents(owner_id,slug,title,status,content_md)
    values ($1,$2,$3,'planned',$4) on conflict(owner_id,slug) do nothing`,
    [ownerId, slug, 'Módulo independiente de Tareas y Kanban', content]);
  const saved = await db.query(`select id,owner_id,slug,title,status,content_md from public.future_development_documents
    where owner_id=$1 and slug=$2`, [ownerId, slug]);
  if (saved.rowCount !== 1 || saved.rows[0].content_md !== content) throw new Error('Plan exists with different content; preserving the saved version');
  await db.query('commit');
  console.log(JSON.stringify({ installed: true, id: saved.rows[0].id, ownerOnly: saved.rows[0].owner_id === ownerId, savedSha256: hash }));
})().catch(async error => {
  await db.query('rollback').catch(() => {});
  console.error('Installation failed:', error.code || error.message);
  process.exitCode = 1;
}).finally(() => db.end().catch(() => {}));
