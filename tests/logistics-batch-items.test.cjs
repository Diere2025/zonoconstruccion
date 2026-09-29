const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, require = () => { throw new Error('Unexpected import'); }) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require, process: { env: {} }, console: { log() {}, error() {} } });
  return exports;
}
const { loadLogisticsBatchItems } = load('src/lib/logisticsBatchItems.ts');

test('item reads filter and deduplicate identities, bound request size, and paginate without truncation', async () => {
  const reads = [];
  const db = { from(table) {
    assert.equal(table, 'order_items');
    let ids;
    return {
      select() { return this; },
      in(column, values) { assert.equal(column, 'order_id'); ids = [...values]; return this; },
      order(column) { assert.equal(column, 'id'); return this; },
      async range(start, end) {
        reads.push({ ids, start, end });
        return { data: Array.from({ length: ids.length === 100 && start === 0 ? 1000 : 1 }, () => ({ order_id: ids[0] })) };
      }
    };
  } };
  const ids = Array.from({ length: 101 }, (_, i) => `order-${i}`);
  const items = await loadLogisticsBatchItems(db, [...ids, ids[0]]);
  assert.equal(items.length, 1002);
  assert.deepEqual(reads.map(r => [r.ids.length, r.start, r.end]), [[100, 0, 999], [100, 1000, 1999], [1, 0, 999]]);
  assert.deepEqual(reads[2].ids, ['order-100']);
});

test('empty batches make no reads; a database failure never returns partial items', async () => {
  assert.equal((await loadLogisticsBatchItems({ from() { throw new Error('Unexpected read'); } }, [])).length, 0);
  const failure = new Error('database unavailable');
  const db = { from() { return {
    select() { return this; }, in() { return this; }, order() { return this; },
    async range(start) { return start === 0 ? { data: Array(1000).fill({}) } : { error: failure }; }
  }; } };
  await assert.rejects(loadLogisticsBatchItems(db, ['order']), /database unavailable/);
});

function routeFixture({ cursor = 0, failItems = false, cancel = false } = {}) {
  const reads = [];
  let writes = 0;
  const orders = [1, 2].map(i => ({ id: `id-${i}`, legacy_code: `JS${i}`, status: 'Entregando', total_amount: 100, payment_method_id: null }));
  const csv = [Array(75).fill('header'), ...orders.map(order => {
    const row = Array(75).fill('');
    row[0] = order.legacy_code; row[15] = 'Entregando'; row[27] = '100';
    row[29] = 'Producto'; row[30] = '1'; row[31] = '100';
    return row;
  })].map(row => row.join(',')).join('\n');
  const db = { from(table) {
    let ids;
    const query = {
      select() { return this; }, not() { return this; }, order() { return this; },
      in(column, values) { ids = [...values]; return this; },
      update() { writes++; return this; }, eq() { return this; },
      delete() { writes++; return this; }, insert() { writes++; return this; },
      range() { return this; },
      then(resolve, reject) {
        if (table === 'order_items') {
          reads.push(ids);
          return Promise.resolve(failItems ? { error: new Error('items unavailable') } : {
            data: ids.map(order_id => ({ order_id, product_name: 'Producto', quantity: 1, unit_price: 100 }))
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: table === 'orders' ? orders : [] }).then(resolve, reject);
      }
    };
    return query;
  } };
  const sync = load('src/lib/orderSync.ts');
  const route = load('src/app/api/admin/audit-deliveries/route.ts', name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name === '@/lib/googleSheets') return { fetchSpreadsheetCsv: async () => csv, fetchSpreadsheetValues: async () => cancel ? [['Reason', '', 'JS1']] : [] };
    if (name === '@/lib/cancelledOrderSheet') return { logisticsCancellationReasons: () => new Map(), logisticsCancellationReason: () => 'Cancelado' };
    if (name === '@/lib/orderSync') return sync;
    if (name === '@/lib/logisticsBatchItems') return { loadLogisticsBatchItems };
    throw new Error(`Unexpected import ${name}`);
  });
  return { run: () => route.POST({ json: async () => ({ cursor, batchSize: 1 }) }), reads, writes: () => writes };
}

test('logistics POST compares only the current cursor batch and preserves unchanged orders', async () => {
  const fixture = routeFixture({ cursor: 1 });
  const response = await fixture.run();
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.reads, [['id-2']]);
  assert.equal(response.body.skippedOrdersCount, 1);
  assert.equal(response.body.syncedOrdersCount, 0);
  assert.equal(response.body.nextCursor, 2);
  assert.equal(fixture.writes(), 0);
});

test('a failed batch item read stops the route before any order mutation', async () => {
  const fixture = routeFixture({ failItems: true });
  const response = await fixture.run();
  assert.equal(response.status, 500);
  assert.equal(fixture.writes(), 0);
});

test('cancelled orders preserve commercial data without downloading their items', async () => {
  const fixture = routeFixture({ cancel: true });
  const response = await fixture.run();
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.reads, []);
  assert.equal(response.body.syncedOrdersCount, 1);
  assert.equal(fixture.writes(), 2);
});
