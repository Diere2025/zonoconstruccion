const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/orderSync.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, Map, Set, Promise });

test('active order matching is exact, supports merged codes and ignores closed orders', () => {
  const active = lib.activeOrderCodes([
    { legacy_code: 'DB10 / AQU20, aq-30', status: 'Pendiente' },
    { legacy_code: 'DB2', status: 'Entregado' }
  ]);
  assert.equal(lib.hasActiveOrder('DB1', active), false);
  assert.equal(lib.hasActiveOrder(' db10 ', active), true);
  assert.equal(lib.hasActiveOrder('DB2', active), false);
  assert.equal(lib.hasActiveOrder('unknown / AQ-30', active), true);
  assert.equal(lib.hasActiveOrder('', active), false);
});

test('central and wholesale share one download per run, but later runs fetch again', async () => {
  let calls = 0;
  const loader = async () => { calls++; return ['row']; };
  const read = lib.oncePerKey(loader);
  const [central, wholesale] = await Promise.all([read('same-sheet'), read('same-sheet')]);
  assert.equal(calls, 1);
  assert.equal(central, wholesale);
  await lib.oncePerKey(loader)('same-sheet');
  assert.equal(calls, 2);
});

test('failed downloads can be retried, not cached forever', async () => {
  let calls = 0;
  const read = lib.oncePerKey(async () => {
    if (++calls === 1) throw new Error('offline');
    return 'ok';
  });
  await assert.rejects(read('sheet'), /offline/);
  assert.equal(await read('sheet'), 'ok');
});

test('cancelled and partial runs never report success', () => {
  assert.equal(lib.syncOutcome(true, 0), 'cancelled');
  assert.equal(lib.syncOutcome(true, 2), 'cancelled');
  assert.equal(lib.syncOutcome(false, 1), 'partial');
  assert.equal(lib.syncOutcome(false, 0), 'success');
});

test('logistics accepts wholesale AQ codes with hyphen and retains existing codes', () => {
  for (const code of ['AQ-123', ' aq-001 ', 'AQU123', 'POW123', 'DB0066', 'CAMB12']) {
    assert.equal(lib.isLogisticsOrderCode(code), true, code);
  }
  for (const code of ['', 'AQ-', 'AQ--123', 'ORIG-AQ-123', 'AQ-FP123', 'Pedido', 'AQ-123 / DB12']) {
    assert.equal(lib.isLogisticsOrderCode(code), false, code);
  }
});

test('logistics reconciliation uses paid-worker batches, bounded concurrency and separate stock sync', () => {
  const route = fs.readFileSync('src/app/api/admin/audit-deliveries/route.ts', 'utf8');
  const page = fs.readFileSync('src/app/admin/importar-pedidos/page.tsx', 'utf8');

  assert.match(route, /Math\.min\(500, Math\.max\(1, requestedBatchSize\)\)/);
  assert.match(route, /allSheetOrders\.slice\(cursor, cursor \+ batchSize\)/);
  assert.match(route, /done,\s*cursor,\s*nextCursor/);
  assert.match(route, /mapWithConcurrency\(plannedUpdates, 5/);
  assert.match(route, /mapWithConcurrency\(itemReplacements, 5/);
  assert.match(route, /\.delete\(\)\s*\.eq\('order_id', update\.dbOrder\.id\)/);
  assert.match(route, /metrics: \{ loadMs, planMs, applyMs, totalMs \}/);
  assert.match(page, /while \(!done && !cancelImportRef\.current\)/);
  assert.match(page, /JSON\.stringify\(\{ cursor, batchSize: 250 \}\)/);
  assert.match(page, /fetch\("\/api\/admin\/sync-stock", \{ method: "POST" \}\)/);
});

test('background import shares Central and avoids rewriting unchanged orders', () => {
  const route = fs.readFileSync('src/app/api/admin/import-job/route.ts', 'utf8');

  assert.match(route, /const fetchSheetOnce = oncePerKey\(fetchSpreadsheetCsv\)/);
  assert.match(route, /const csvText = await sheetDownloads\.get\(sheet\.url\)!/);
  assert.match(route, /order_discount_type, order_discount_value, order_discount_amount/);
  assert.match(route, /if \(discountChanged \|\| totalsChanged\)/);
  assert.match(route, /Object\.assign\(dbOrder, updatePayload\)/);
});

test('stock synchronization shares downloads and only writes changed stock', () => {
  const unimported = fs.readFileSync('src/lib/unimportedOrders.ts', 'utf8');
  const stock = fs.readFileSync('src/app/api/admin/sync-stock/route.ts', 'utf8');

  assert.match(unimported, /const fetchSheetOnce = oncePerKey\(fetchSpreadsheetCsv\)/);
  assert.match(stock, /const productLookup = buildProductLookup\(dbProducts\)/);
  assert.match(stock, /if \(stockValuesChanged\(dbProd,/);
  assert.match(stock, /unchangedCount: dbProducts\.length - updatesToUpsert\.length/);
  assert.match(stock, /updatesToUpsertMap\.set\(dbProd\.id, \{\s*\.\.\.dbProd/);
});

test('bounded concurrency preserves order and never exceeds the requested worker count', async () => {
  let active = 0;
  let peak = 0;
  const result = await lib.mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async value => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, value % 2));
    active--;
    return value * 10;
  });

  assert.deepEqual(Array.from(result), [10, 20, 30, 40, 50, 60]);
  assert.equal(peak, 3);
});
