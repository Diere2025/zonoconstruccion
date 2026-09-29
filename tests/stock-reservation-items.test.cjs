const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/stockReservationItems.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { deduplicateReservationItems } = helper.exports;
const item = (orderId, product, quantity, code = 'JS25691 / JS25692') => ({
  product_id: product, quantity, orders: { id: orderId, legacy_code: code }
});

test('Aldo conserva las dos cámaras en líneas separadas del pedido unificado', () => {
  const items = [item('aldo', 'camara', 1), item('aldo', 'camara', 1)];
  const result = deduplicateReservationItems(items);
  assert.deepEqual(result, items);
  assert.equal(result.reduce((total, line) => total + line.quantity, 0), 2);
});

test('una copia del pedido no duplica reservas, incluso con líneas intercaladas', () => {
  const items = [item('original', 'camara', 1), item('copia', 'camara', 1),
    item('original', 'camara', 2), item('copia', 'camara', 2),
    item('original', 'tanque', 1), item('copia', 'tanque', 1)];
  assert.deepEqual(deduplicateReservationItems(items), [items[0], items[2], items[4]]);
});

test('pedidos distintos y pedidos sin código conservan sus reservas', () => {
  const items = [item('a', 'camara', 1, 'JS1'), item('b', 'camara', 2, 'JS2'),
    item('c', 'camara', 3, ''), item('d', 'camara', 4, '')];
  assert.deepEqual(deduplicateReservationItems(items), items);
});

test('el nombre identifica productos sin ID, conservando sus líneas legítimas', () => {
  const items = [item('a', null, 1), item('a', null, 2), item('b', null, 1)]
    .map(line => ({ ...line, product_name: 'Cámara CII' }));
  assert.deepEqual(deduplicateReservationItems(items), items.slice(0, 2));
});
