const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/erp/stockSheetSync.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function loadStockSync(products, persist) {
  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        gte() { return this; },
        order() { return this; },
        range() { return table === 'products' ? Promise.resolve({ data: products }) : this; },
        returns() { return Promise.resolve({ data: [] }); },
      };
    },
    rpc: persist,
  };
  const dependencies = {
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/utils': { getArgentinaDaysAgoString: () => '2026-10-27' },
    '@/lib/googleSheets': { fetchSpreadsheetCsv: async () => 'Producto,Stock Actual,Reservado,Stock Disponible\nTanque,5,0,5' },
    '@/lib/unimportedOrders': { getUnimportedSellerOrders: async () => null },
    '@/lib/stockReservationItems': { deduplicateReservationItems: items => items },
    '@/lib/serviceProducts': { isServiceProduct: product => product.is_service },
    '@/lib/stockPurchaseContext': {},
  };
  const exports = {};
  new Function('require', 'exports', outputText)(name => dependencies[name], exports);
  return exports.syncStockFromSheet;
}

test('sincroniza productos emparejados y reservas de solo ERP en una escritura de stock', async () => {
  const products = [
    { id: 'tank', name: 'Tanque', sku: 'T-1', price: 123, stock_physical: 3, stock_reserved: 0, stock_current: 3 },
    { id: 'pump', name: 'Bomba', sku: 'B-1', stock_physical: 7, stock_reserved: 2, stock_current: 5 },
    { id: 'service', name: 'Instalación', is_service: true, stock_physical: 1, stock_reserved: 2, stock_current: -1 },
  ];
  const writes = [];
  const sync = loadStockSync(products, async (...args) => {
    writes.push(args);
    return { data: 2 };
  });

  const result = await sync();
  assert.deepEqual(writes, [['apply_stock_sheet_updates', { p_updates: [
    { id: 'tank', stock_physical: 5, stock_reserved: 0, stock_current: 5 },
    { id: 'pump', stock_physical: 7, stock_reserved: 0, stock_current: 7 },
  ] }]]);
  assert.equal(result.updatedCount, 2);
  assert.equal(result.unchangedCount, 1);
});

test('omite la escritura cuando las existencias coinciden', async () => {
  const sync = loadStockSync([
    { id: 'tank', name: 'Tanque', stock_physical: 5, stock_reserved: 0, stock_current: 5 },
  ], () => assert.fail('No se esperaba una escritura'));
  assert.equal((await sync()).updatedCount, 0);
});
