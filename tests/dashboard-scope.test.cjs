const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/dashboardScope.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, { exports: lib });

test('channel segments explain the general total, without treating unknown records as retail', () => {
  const rows = [
    { channel: 'minorista', total_amount: 10 }, { channel: 'web_organica', total_amount: 20 },
    { channel: 'mostrador_minorista', total_amount: 30 }, { channel: 'vendedor_externo', total_amount: 40 },
    { channel: 'mayorista', total_amount: 50 }, { channel: null, total_amount: 60 },
    { channel: 'legacy', total_amount: 70 }, { channel: 'mayorista', total_amount: 99, status: 'Cancelado' },
    { channel: 'minorista', total_amount: 99, status: 'Anulado' }
  ];
  const summary = lib.dashboardChannelSummary(rows);
  assert.equal(summary.minorista.sales, 100);
  assert.equal(summary.mayorista.sales, 50);
  assert.equal(summary.unclassified.sales, 130);
  assert.equal(Object.values(summary).reduce((total, group) => total + group.orders, 0), rows.length);
  assert.equal(Object.values(summary).reduce((total, group) => total + group.sales, 0), 280);
  for (const channel of ['minorista', 'mayorista', 'unclassified']) {
    const subset = rows.filter(row => lib.matchesDashboardChannel(row, channel));
    assert.equal(subset.length, summary[channel].orders);
  }
  assert.ok(rows.every(row => lib.matchesDashboardChannel(row, 'all')));
});

test('deduplication preserves reused codes from another seller or channel and uncoded orders', () => {
  const rows = [
    { id: '1', seller_id: 'a', channel: 'minorista', legacy_code: ' AQ-FP-1 ' },
    { id: '2', seller_id: 'a', channel: 'minorista', legacy_code: 'AQ-FP-1' },
    { id: '3', seller_id: 'a', channel: 'mayorista', legacy_code: 'AQ-FP-1' },
    { id: '4', seller_id: 'b', channel: 'minorista', legacy_code: 'AQ-FP-1' },
    { id: '5' }, { id: '6' }
  ];
  assert.deepEqual(Array.from(lib.uniqueDashboardOrders(rows), row => row.id), ['1', '3', '4', '5', '6']);
});

test('pagination retrieves more than 1000 rows and propagates errors without partial totals', async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const ranges = [];
  const result = await lib.pagedDashboardQuery({ range: async (start, end) => {
    ranges.push([start, end]); return { data: rows.slice(start, end + 1), error: null };
  } });
  assert.equal(result.data.length, rows.length);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499], [1201, 1700]]);
  const failure = await lib.pagedDashboardQuery({ range: async start => start === 0 ? { data: rows.slice(0, 500), error: null } : { data: null, error: { message: 'Unavailable' } } });
  assert.equal(failure.data.length, 0);
  assert.equal(failure.error.message, 'Unavailable');
});

test('a server cap smaller than the requested page size cannot truncate totals', async () => {
  const rows = Array.from({ length: 251 }, (_, id) => ({ id }));
  const result = await lib.pagedDashboardQuery({ range: async start => ({ data: rows.slice(start, start + 100), error: null }) });
  assert.equal(result.data.length, rows.length);
});
