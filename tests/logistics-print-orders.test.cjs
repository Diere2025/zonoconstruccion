const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsPrintOrders.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, Number, String, Math, Map, Set, Array, RegExp });

function row(code, detail, itemName, price) {
  const values = Array(78).fill('');
  values[1] = code;
  values[2] = '19/09/2026';
  values[5] = 'Cliente Prueba';
  values[10] = detail;
  values[17] = 'Morón';
  values[18] = 'Calle 123';
  values[21] = 'Transferencia';
  values[23] = 'No Abonado';
  values[28] = String(price);
  values[29] = String(price);
  values[30] = itemName;
  values[31] = '1';
  values[32] = String(price);
  return values;
}

test('parses Spanish numbers without confusing thousands and decimals', () => {
  assert.equal(lib.parseSheetNumber('$ 129.400'), 129400);
  assert.equal(lib.parseSheetNumber('-25.000,50'), -25000.5);
});

test('merges sibling sheet rows and uses the ERP commercial brand', () => {
  const rows = [
    row('JS100', 'VA CON EL PEDIDO JS101 / entregar juntos', 'Tanque', 200000),
    row('JS101', 'VA CON EL PEDIDO JS100', 'Flotante', 10000)
  ];
  const parsed = lib.parseLogisticsPrintRows(rows, 3);
  const merged = lib.mergeLogisticsPrintOrders(parsed, [{
    legacyCode: 'JS100 / JS101',
    commercialBrand: 'aquafort',
    channel: 'web_organica'
  }]);

  assert.equal(merged.length, 1);
  assert.deepEqual(Array.from(merged[0].codes), ['JS100', 'JS101']);
  assert.equal(merged[0].items.length, 2);
  assert.equal(merged[0].orderTotal, 210000);
  assert.equal(merged[0].commercialBrand, 'aquafort');
  assert.deepEqual(Array.from(merged[0].sourceRows), [3, 4]);
});

test('keeps unrelated rows as separate receipts', () => {
  const parsed = lib.parseLogisticsPrintRows([
    row('JS200', '', 'Tanque', 100000),
    row('JS201', '', 'Tanque', 100000)
  ]);
  assert.equal(lib.mergeLogisticsPrintOrders(parsed).length, 2);
});

test('calculates IVA 21% separately when payment is Transferencia con IVA', () => {
  const values = row('AQ-FP00023', '', 'AquaFort - TRIC 500L Gris', 482800);
  values[21] = 'Transferencia (IVA 21%)';
  values[24] = '584188';
  values[25] = '';
  values[29] = '0';

  const [parsed] = lib.parseLogisticsPrintRows([values]);

  assert.equal(parsed.productsSubtotal, 482800);
  assert.equal(parsed.surcharge, 101388);
  assert.equal(parsed.orderTotal, 584188);
  assert.equal(parsed.pendingBalance, 0);
});
