const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/stockPurchaseContext.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { buildStockPurchaseContext } = helper.exports;
const products = [{ id: 'p1', name: 'Escalera aluminio', sku: 'ESC-16' }, { id: 'p2', name: 'Tanque', sku: 'T500' }];
const suppliers = [{ id: 's1', name: 'Garden' }, { id: 's2', name: 'Otro proveedor' }];
const line = (overrides = {}) => ({ product_id: 'p1', quantity_ordered: 10, quantity_received: 3, status: 'Parcial', purchase_orders: { id: 'oc1', oc_code: 'OC-001', supplier_id: 's1', status: 'Parcial' }, ...overrides });
const build = (items, relations = []) => buildStockPurchaseContext(products, suppliers, relations, items);

test('suma saldos pendientes y agrupa múltiples líneas de una OC sin duplicarla', () => {
  const context = build([line(), line({ quantity_ordered: 4, quantity_received: 1 })]).p1;
  assert.equal(context.pendingIncoming, 10);
  assert.equal(context.pendingOrders.length, 1);
  assert.equal(context.pendingOrders[0].quantity, 10);
  assert.equal(context.pendingOrders[0].code, 'OC-001');
  assert.deepEqual(context.suppliers, [suppliers[0]]);
});

test('excluye OCs canceladas o cumplidas, ítems cancelados y faltantes cerrados', () => {
  const items = [line({ status: 'Cancelado' }), line({ shortfall_closed: true }),
    ...['Cancelado', 'Cumplido'].map(status => line({ purchase_orders: { ...line().purchase_orders, status } }))];
  assert.equal(build(items).p1.pendingIncoming, 0);
});

test('no genera ingresos negativos ni no finitos con recepción completa o excedente', () => {
  assert.equal(build([line({ quantity_received: 10 }), line({ quantity_received: 12 }), line({ quantity_ordered: 'inválido' })]).p1.pendingIncoming, 0);
});

test('conserva proveedores vinculados sin compras y añade proveedores de OCs abiertas', () => {
  const result = build([line()], [{ product_id: 'p1', supplier_id: 's2' }, { product_id: 'p1', supplier_id: 's1' }, { product_id: 'p2', supplier_id: 's2' }]);
  assert.equal(result.p1.suppliers.length, 2);
  assert.deepEqual(result.p2, { suppliers: [suppliers[1]], pendingIncoming: 0, pendingOrders: [] });
});

test('resuelve nombres o SKU antiguos sin ID sólo con coincidencia única', () => {
  assert.equal(build([line({ product_id: null, raw_product_name: 'ESC 16' })]).p1.pendingIncoming, 7);
  const ambiguous = [...products, { id: 'duplicate', name: 'Escalera aluminio' }];
  const result = buildStockPurchaseContext(ambiguous, suppliers, [], [line({ product_id: null, raw_product_name: 'Escalera aluminio' })]);
  assert.equal(result.p1.pendingIncoming, 0);
  assert.equal(result.duplicate.pendingIncoming, 0);
});

test('el ID explícito prevalece sobre nombres de otros productos', () => {
  const result = build([line({ raw_product_name: 'Tanque' }), line({ product_id: 'desconocido', raw_product_name: 'Tanque' })]);
  assert.equal(result.p1.pendingIncoming, 7);
  assert.equal(result.p2.pendingIncoming, 0);
});

test('suma compras de proveedores distintos y respeta cantidades decimales', () => {
  const result = build([line({ quantity_ordered: '2.5', quantity_received: '0.5' }), line({ quantity_ordered: 1, quantity_received: 0, purchase_orders: { id: 'oc2', oc_code: 'OC-002', supplier_id: 's2', status: 'Pendiente' } })]).p1;
  assert.equal(result.pendingIncoming, 3);
  assert.equal(result.pendingOrders.length, 2);
  assert.equal(result.suppliers.length, 2);
});
