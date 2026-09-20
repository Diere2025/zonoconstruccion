const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('high-traffic screens avoid aggressive polling in hidden tabs', () => {
  const payments = fs.readFileSync('src/app/admin/cobros-mp/page.tsx', 'utf8');
  const results = fs.readFileSync('src/components/finanzas/EstadoResultadosView.tsx', 'utf8');

  assert.match(payments, /document\.hidden/);
  assert.match(payments, /setInterval\(refreshVisibleData, 60000\)/);
  assert.doesNotMatch(payments, /setInterval\([^)]*12000/);

  assert.match(results, /requestInFlightRef/);
  assert.match(results, /if \(!document\.hidden\)/);
  assert.match(results, /120000/);
  assert.doesNotMatch(results, /45000/);
});

test('stock sources overlap and historical order pages use bounded batches', () => {
  const stock = fs.readFileSync('src/app/api/admin/sync-stock/route.ts', 'utf8');
  const unimported = fs.readFileSync('src/lib/unimportedOrders.ts', 'utf8');

  assert.match(stock, /Promise\.all\(\[\s*timed\(fetchSpreadsheetCsv/);
  assert.match(stock, /sourcesMs/);
  assert.match(unimported, /mapWithConcurrency\(SELLER_SHEETS, 4/);
  assert.match(unimported, /const pages = \[page, page \+ 1\]/);
  assert.doesNotMatch(unimported, /count: 'exact'/);
});

test('payment list and daily totals are requested together', () => {
  const route = fs.readFileSync('src/app/api/admin/cobros-mp-data/route.ts', 'utf8');
  assert.match(route, /Promise\.all\(\[\s*query\.limit\(300\),\s*todayStatsPromise/);
});
