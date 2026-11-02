import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRONS, SHEETS, activeCodes, selectRows, checkStockSource, readOrderSource, runSync } from '../workers/planillas-sync/runner.mjs';
import worker, { createErpRequest } from '../workers/planillas-sync/index.mjs';
import { mergeContiguousSheetRows, parseCSV } from '../workers/planillas-sync/rows.mjs';

const csv = rows => rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
const header = Array(34).fill(''); header[0] = 'Pedido_Estado'; header[1] = 'Pedido_Código';
const row = (code, status = 'Pendiente') => { const r = Array(34).fill(''); r[0] = status; r[1] = code; return r; };
const stock = 'Producto,Stock Actual,Reservado,Stock Disponible\nTanque,10,2,8';

test('daily UTC triggers correspond exactly to the three Argentina times', () => {
  const times = CRONS.map(cron => {
    const [minute, hour] = cron.split(' ').map(Number);
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(Date.UTC(2026, 10, 2, hour, minute)));
  });
  assert.deepEqual(times, ['07:00', '14:00', '23:30']);
});

test('limits seller history, central completions and ENC using complete code identities', () => {
  const active = activeCodes([{ legacy_code: 'DB1 / JS2', status: 'Entregando' }, { legacy_code: 'DB3', status: 'Entregado' }]);
  const rows = [header, row('DB1'), row('DB10'), row('DB3', 'Entregado'), row('DB4', 'No está'), row('ENC1'), row('JS2', 'Cancelado'), row('CAMB1')];
  assert.deepEqual(selectRows(rows, SHEETS[0], active).map(r => r[1]), ['DB1', 'DB4', 'JS2']);
  assert.deepEqual(selectRows(rows, SHEETS[4], active).map(r => r[1]), ['DB1', 'DB10', 'DB4', 'JS2', 'CAMB1']);
});

test('CSV preserves quoted delimiters, embedded line breaks and continuation items', () => {
  assert.deepEqual(parseCSV('a,b\n"uno, dos","salto\ncomillas ""ok"""'), [['a', 'b'], ['uno, dos', 'salto\ncomillas "ok"']]);
  const a = row('JS100'), b = row('JS101');
  for (const r of [a, b]) { r[3] = '02/11/2026'; r[5] = 'Cliente'; r[18] = 'Calle'; r[28] = '1.250,00'; }
  a[30] = 'Tanque'; a[31] = '1'; b[30] = 'Base'; b[31] = '1';
  const merged = mergeContiguousSheetRows([header, a, b]);
  assert.equal(merged.length, 2); assert.equal(merged[1][1], 'JS100 / JS101');
  assert.equal(merged[1][28], '2500'); assert.equal(merged[1][34], 'Base');
});

test('invalid, missing and formula-error source data aborts', () => {
  assert.throws(() => readOrderSource('<html>Login</html>', 'Central'), /HTML/);
  assert.throws(() => readOrderSource('A,B\n1,2', 'Central'), /encabezado/);
  assert.throws(() => readOrderSource(csv([header, row('#REF!')]), 'Central'), /fórmula/);
  assert.throws(() => checkStockSource('Producto,Stock Actual\nTanque,#N/A'), /fórmula/);
  assert.throws(() => checkStockSource('Producto,Stock Actual\nTanque,'), /cantidades/);
  assert.equal(checkStockSource(stock), 1);
});

async function scenario({ dryRun = false, failSheet = -1, warnings = false, protectedWarning = false, alertFailure = false, conflict = false, stalled = false } = {}) {
  const calls = []; let reads = 0;
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path.includes('import-master-data')) return { orders: [{ legacy_code: 'DB1', status: 'Pendiente' }] };
    if (path.startsWith('/api/admin/fetch-sheet')) {
      if (decodeURIComponent(path).includes('447948741')) return stock;
      if (reads++ === failSheet) throw Error('Fuente caída');
      return csv([header, row('DB1')]);
    }
    if (path === '/api/admin/import-sheet') return { success: true, warnings: warnings ? ['Error de pedido'] : protectedWarning ? ['[14:00:00] ⚠️ Pedido AQ-FP00040: fila parcial de AQ-FP00040 / AQ-FP00041; se conservan artículos e importes del ERP.'] : [], supportAlerts: { failed: alertFailure ? 1 : 0 }, totalUpdated: 1 };
    if (path === '/api/admin/audit-deliveries') return { success: true, done: !stalled, nextCursor: 0, syncedOrdersCount: 1, plannedUpdatesCount: 1, conflictingDeliveryDatesCount: conflict ? 1 : 0 };
    if (path === '/api/admin/sync-stock') return options.body ? { success: true, updatedCount: 1 } : { comparisonList: [{}] };
    throw Error(path);
  };
  try { return { result: await runSync({ request, dryRun, runId: 'test' }), calls }; }
  catch (error) { return { error, calls }; }
}

test('dry run reads every source and previews logistics without stock/order mutations', async () => {
  const { result, calls } = await scenario({ dryRun: true });
  assert.equal(result.dryRun, true); assert.equal(result.sheets.length, 5);
  assert.equal(calls.filter(c => c.path.includes('import-sheet')).length, 0);
  assert.equal(calls.filter(c => c.path === '/api/admin/sync-stock' && c.body).length, 0);
  assert.equal(calls.find(c => c.path === '/api/admin/audit-deliveries').body.dryRun, true);
});

test('failed source prevents all mutations even when earlier sources loaded', async () => {
  const { error, calls } = await scenario({ failSheet: 3 });
  assert.match(error.message, /Fuente caída/); assert.equal(calls.filter(c => c.body).length, 0);
});

test('success processes sellers then central, logistics and stock in sequence', async () => {
  const { result, calls } = await scenario();
  assert.equal(result.updated, 5); assert.equal(result.stockUpdated, 1);
  const mutations = calls.filter(c => c.body);
  assert.deepEqual(mutations.slice(0, 5).map(c => c.body.sheetName), SHEETS.map(s => `${s.name} (Automático)`));
  assert.deepEqual(mutations.slice(5).map(c => c.path), ['/api/admin/audit-deliveries', '/api/admin/sync-stock']);
  assert.ok(mutations.slice(0, 5).every(c => !c.body.syncPaymentMethods && c.body.skipENC && !c.body.skipCAMB));
});

test('write warnings, unrecorded support notices and stuck cursor never proceed to stock', async () => {
  for (const options of [{ warnings: true }, { protectedWarning: true, alertFailure: true }, { stalled: true }]) {
    const { error, calls } = await scenario(options);
    assert.ok(error); assert.equal(calls.filter(c => c.path === '/api/admin/sync-stock' && c.body).length, 0);
  }
});

test('preserved ERP details and dates remain explicit notices while the full stock stage completes', async () => {
  const { result, calls } = await scenario({ protectedWarning: true, conflict: true });
  assert.equal(result.protectedPartialRows, 5);
  assert.equal(result.deliveryDateConflicts, 1);
  assert.equal(result.warnings.length, 6);
  assert.equal(result.stockUpdated, 1);
  assert.equal(calls.filter(c => c.path === '/api/admin/sync-stock' && c.body).length, 1);
});

test('HTTP errors and ambiguous mutation failures are not silently retried', async () => {
  let calls = 0;
  const request = createErpRequest({ ERP_ORIGIN: 'https://example.test' }, async () => { calls++; throw Error('Network failure'); });
  await assert.rejects(() => request('/api/admin/import-sheet', { body: {} }), /Network/);
  assert.equal(calls, 1);
  const bad = createErpRequest({ ERP_ORIGIN: 'https://example.test' }, async () => Response.json({ success: false }));
  await assert.rejects(() => bad('/api/admin/import-sheet', { body: {} }), /error/);
  const redirect = createErpRequest({ ERP_ORIGIN: 'https://example.test' }, async (_url, options) => {
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://other.test' } });
  });
  await assert.rejects(() => redirect('/api/admin/import-sheet', { body: {} }), /HTTP 302/);
});

test('keeps the first logistics selection fixed across all subsequent batches', async () => {
  const selection = ['DB1', 'DB2', 'DB3'];
  let batches = 0;
  const request = async (path, { body } = {}) => {
    if (path.includes('import-master-data')) return { orders: [{ legacy_code: 'DB1', status: 'Pendiente' }] };
    if (path.includes('fetch-sheet')) return decodeURIComponent(path).includes('447948741') ? stock : csv([header, row('DB1')]);
    if (path === '/api/admin/sync-stock') return { comparisonList: [{}] };
    if (path === '/api/admin/audit-deliveries') {
      if (batches > 0) assert.deepEqual(body.reviewOrderCodes, selection);
      return { success: true, done: ++batches === 3, nextCursor: batches, review: { mode: 'recent', since: '2026-10-31' }, ...(batches === 1 ? { reviewOrderCodes: selection } : {}) };
    }
    throw Error(path);
  };
  await runSync({ request, dryRun: true, runId: 'fixed-selection-test' });
  assert.equal(batches, 3);
});

test('worker control endpoints require authentication before database access', async () => {
  for (const pathname of ['/status', '/preview', '/run']) {
    const response = await worker.fetch(new Request(`https://worker.test${pathname}`, { method: pathname === '/status' ? 'GET' : 'POST' }), { CONTROL_TOKEN: 'secret' });
    assert.equal(response.status, 401);
  }
});
