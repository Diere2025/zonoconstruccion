// Modes: check-db (transaction rolled back), apply-db, deploy (no schedules),
// preview, run, activate, deactivate, status. No credentials are printed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
process.loadEnvFile('.env.local');
const directory = 'output/scheduled-sheet-sync';
const workerName = 'zono-planillas-sync';
const account = 'b6174428e949acf36731604b99f1a5a1';
fs.mkdirSync(directory, { recursive: true });

function controlToken() {
  const file = `${directory}/control-token`;
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

async function cf(endpoint, method = 'GET', body) {
  const config = fs.readFileSync(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
  if (!token) throw Error('No hay sesión de Cloudflare.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${endpoint}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!data.success) throw Error(`Cloudflare HTTP ${response.status}: ${JSON.stringify(data.errors)}`);
  return data.result;
}

async function database(apply) {
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  await db.connect();
  try {
    await db.query('begin');
    const sql = fs.readFileSync('database/db_migration_20261102_scheduled_sheet_sync.sql', 'utf8').replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, '');
    await db.query(sql);
    const token = apply ? controlToken() : 'transactional-test-only';
    await db.query('insert into scheduled_sheet_sync_auth(singleton,token_hash) values(true,$1) on conflict(singleton) do update set token_hash=excluded.token_hash', [crypto.createHash('sha256').update(token).digest('hex')]);
    if (apply) { await db.query('commit'); console.log('Registro y exclusión de sincronizaciones instalados.'); return; }
    const assert = require('node:assert/strict');
    // Test the isolated lease state inside this transaction; rollback restores
    // any failed-run cooldown that was present before the rehearsal.
    await db.query("update scheduled_sheet_sync_lease l set run_id=null,expires_at=null from scheduled_sheet_sync_runs r where l.run_id=r.id and r.status='failed'");
    const key = `test:${crypto.randomUUID()}`;
    const claim = async (key, dryRun = true) => (await db.query('select claim_scheduled_sheet_sync($1,$2,$3) id', [token, key, dryRun])).rows[0].id;
    const first = await claim(key);
    assert.ok(first, 'An existing background import prevents this test; retry when it ends.');
    assert.equal(await claim(key + ':other'), null);
    await db.query('select update_scheduled_sheet_sync($1,$2,$3,$4)', [token, first, 'Prueba', { test: true }]);
    await db.query('select finish_scheduled_sheet_sync($1,$2,true,$3,null)', [token, first, { test: true }]);
    assert.equal(await claim(key), null);
    const previewFailure = await claim(key + ':preview-failure');
    await db.query('select finish_scheduled_sheet_sync($1,$2,false,$3,$4)', [token, previewFailure, {}, 'Error de vista previa']);
    const second = await claim(key + ':second', false);
    assert.ok(second);
    assert.equal((await db.query('select authorize_scheduled_sheet_import($1,$2,$3) allowed', [token, second, 'Jazmín Sánchez'])).rows[0].allowed, false);
    await db.query('select update_scheduled_sheet_sync($1,$2,$3,$4)', [token, second, 'Pedidos: Jazmín Sánchez', {}]);
    assert.equal((await db.query('select authorize_scheduled_sheet_import($1,$2,$3) allowed', [token, second, 'Jazmín Sánchez'])).rows[0].allowed, true);
    assert.equal((await db.query('select authorize_scheduled_sheet_import($1,$2,$3) allowed', [token, second, 'Central/Ruteo'])).rows[0].allowed, false);
    await db.query('select finish_scheduled_sheet_sync($1,$2,false,$3,$4)', [token, second, {}, 'Error de prueba']);
    assert.equal(await claim(key + ':after-failure'), null);
    await db.query("update scheduled_sheet_sync_lease set expires_at=clock_timestamp()-interval '1 minute' where singleton");
    const third = await claim(key + ':expired');
    assert.ok(third);
    await db.query("update scheduled_sheet_sync_lease set expires_at=clock_timestamp()-interval '1 minute' where singleton");
    assert.ok(await claim(key + ':recovered'));
    assert.equal((await db.query('select status from scheduled_sheet_sync_runs where id=$1', [third])).rows[0].status, 'failed');
    const permissions = await db.query("select has_table_privilege('anon','public.scheduled_sheet_sync_auth','select') a,has_function_privilege('authenticated','public.finish_scheduled_sheet_sync(text,uuid,boolean,jsonb,text)','execute') b,has_function_privilege('anon','public.claim_scheduled_sheet_sync(text,text,boolean)','execute') c");
    assert.deepEqual(permissions.rows[0], { a: false, b: false, c: true });
    await db.query('savepoint bad_token');
    await db.query('set local role anon');
    await assert.rejects(() => db.query('select claim_scheduled_sheet_sync($1,$2,true)', ['wrong-token', key]), e => e.code === '42501');
    await db.query('rollback to savepoint bad_token');
    await db.query('rollback');
    console.log('PASS SQL: exclusión, deduplicación, cierre, retención tras fallo, vencimiento, recuperación y permisos; cambios revertidos.');
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'check-db' || mode === 'apply-db') return database(mode === 'apply-db');
  const endpoint = `/workers/scripts/${workerName}`;
  if (mode === 'deploy') {
    const dedicatedToken = controlToken();
    const code = require('esbuild').buildSync({ entryPoints: ['workers/planillas-sync/index.mjs'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false }).outputFiles[0].text;
    const form = new FormData();
    form.set('metadata', new Blob([JSON.stringify({ main_module: 'worker.mjs', compatibility_date: '2026-11-02',
      observability: { enabled: true }, limits: { cpu_ms: 300000 },
      bindings: [
        { name: 'ERP_ORIGIN', type: 'plain_text', text: 'https://erp.zono.com.ar' },
        { name: 'SUPABASE_URL', type: 'plain_text', text: process.env.NEXT_PUBLIC_SUPABASE_URL },
        { name: 'SUPABASE_ANON_KEY', type: 'plain_text', text: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        { name: 'CONTROL_TOKEN', type: 'secret_text', text: dedicatedToken },
      ],
    })], { type: 'application/json' }));
    form.set('worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'worker.mjs');
    const deployed = await cf(endpoint, 'PUT', form);
    const subdomain = await cf('/workers/subdomain');
    await cf(endpoint + '/subdomain', 'POST', { enabled: true, previews_enabled: false });
    const info = { worker: workerName, url: `https://${workerName}.${subdomain.subdomain}.workers.dev`, deployedAt: new Date().toISOString(), version: deployed.id };
    fs.writeFileSync(`${directory}/deployment.json`, JSON.stringify(info, null, 2));
    console.log(JSON.stringify(info));
    return;
  }
  if (mode === 'activate' || mode === 'deactivate') {
    if (mode === 'activate') {
      const preview = JSON.parse(fs.readFileSync(`${directory}/preview.json`, 'utf8'));
      const run = JSON.parse(fs.readFileSync(`${directory}/run.json`, 'utf8'));
      if (preview.success !== true || run.success !== true) throw Error('La verificación y primera ejecución deben completar antes de activar.');
    }
    console.log(JSON.stringify(await cf(endpoint + '/schedules', 'PUT', mode === 'activate' ? [{ cron: '0 10 * * *' }, { cron: '0 17 * * *' }, { cron: '30 2 * * *' }] : [])));
    return;
  }
  if (!['status', 'preview', 'run'].includes(mode)) throw Error('Modo inválido.');
  const info = JSON.parse(fs.readFileSync(`${directory}/deployment.json`, 'utf8'));
  const token = fs.readFileSync(`${directory}/control-token`, 'utf8').trim();
  const response = await fetch(info.url + '/' + mode, { method: mode === 'status' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(14 * 60000) });
  const result = await response.json();
  fs.writeFileSync(`${directory}/${mode}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  if (mode === 'status') console.log(JSON.stringify({ installedSchedules: await cf(endpoint + '/schedules') }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
