const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/wholesaleOrders.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, Number, String, Math });

test('Facundo AQ orders use Procedencia instead of the code prefix', () => {
  assert.equal(lib.resolveImportedOrderChannel({
    orderCode: 'AQ-FP00017', sellerName: 'Facundo Paz', advertisingSource: 'Mayorista', defaultChannel: 'web_organica'
  }), 'mayorista');
  assert.equal(lib.resolveImportedOrderChannel({
    orderCode: 'AQ-FP00018', sellerName: 'Facundo Paz', advertisingSource: 'Orgánico / Cliente Habitual / Recomendado', defaultChannel: 'mayorista'
  }), 'web_organica');
  for (const advertisingSource of ['Cliente', 'Página web', 'Reenviado de Minorista', 'Recomendado', 'Otro']) {
    assert.equal(lib.resolveImportedOrderChannel({
      orderCode: 'AQ-FP00019', sellerName: 'Facundo Paz', advertisingSource, defaultChannel: 'web_organica'
    }), 'mayorista');
  }
});

test('AQ, AQU and POW remain wholesale for other sellers', () => {
  for (const orderCode of ['AQ-100', 'AQU100', 'POW100']) {
    assert.equal(lib.resolveImportedOrderChannel({ orderCode, sellerName: 'Diego Bóveda', defaultChannel: 'web_organica' }), 'mayorista');
  }
});

test('discount product rows are recognized and totaled as an order adjustment', () => {
  const row = Array(42).fill('');
  row[30] = 'Tanque'; row[31] = '2'; row[32] = '100000';
  row[34] = 'Descuento Compra Mayorista'; row[35] = '1'; row[36] = '-25000';
  row[38] = 'Bonificación comercial'; row[39] = '2'; row[40] = '-1000';
  assert.equal(lib.sheetDiscountAmount(row), 27000);
});
