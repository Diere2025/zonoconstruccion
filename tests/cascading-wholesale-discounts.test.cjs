const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(path, extras = {}) {
  const exports = {};
  const source = fs.readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { exports, Math, Number, console, ...extras });
  return exports;
}

const discounts = compile('src/lib/orderDiscounts.ts');
const sheetProducts = compile('src/lib/sheetProducts.ts');
const sheets = compile('src/lib/googleSheets.ts', {
  require(name) {
    if (name === './sheetProducts' || name === '@/lib/sheetProducts') return sheetProducts;
    throw new Error(`Unexpected import: ${name}`);
  }
});

test('wholesale discounts remain separate in the order and become one fixed sheet adjustment', () => {
  const breakdown = discounts.calculateCascadingDiscounts(2410700, [
    { id: 'volume', description: 'Descuento volumen', type: 'percentage', value: 20 },
    { id: 'pickup', description: 'Descuento retiro en fábrica', type: 'percentage', value: 5 }
  ]);
  assert.deepEqual(Array.from(breakdown, item => item.amount), [482140, 96428]);
  const totalDiscount = breakdown.reduce((sum, item) => sum + item.amount, 0);
  assert.equal(totalDiscount, 578568);

  const sheetItems = sheets.buildSheetOrderItems([
    { id: 'tank', name: 'Tanque AquaFort', quantity: 1, customPrice: 2410700, basePrice: 2410700 }
  ], totalDiscount);
  const adjustment = sheetItems.filter(item => item.name === 'Descuento Compra Mayorista');
  assert.equal(adjustment.length, 1);
  assert.equal(adjustment[0].unitPrice, -578568);
  assert.equal(sheetItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), 1832132);
});

test('sheet adjustment includes item reductions when list prices are restored', () => {
  const sheetItems = sheets.buildSheetOrderItems([
    { id: 'tank', name: 'Tanque AquaFort', quantity: 2, customPrice: 90, basePrice: 100 }
  ], 18);
  assert.equal(sheetItems[0].unitPrice, 100);
  assert.equal(sheetItems[1].name, 'Descuento Compra Mayorista');
  assert.equal(sheetItems[1].unitPrice, -38);
  assert.equal(sheetItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), 162);
});
