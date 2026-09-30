const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const quoteSource = fs.readFileSync('src/app/vendedores/presupuestos-mayorista/page.tsx', 'utf8');
const ast = ts.createSourceFile('quote.tsx', quoteSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleAddRetailProduct') callback = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

function cartHarness(initial = []) {
  let cart = initial;
  const context = { setCartItems: updater => { cart = updater(cart); } };
  vm.createContext(context);
  const compiled = ts.transpileModule(`const addRetail = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(compiled, context);
  return {
    add(product) { context.product = product; vm.runInContext('addRetail(product)', context); },
    get cart() { return cart; }
  };
}

test('Retail product outside the wholesale list keeps its actual ID and retail price', () => {
  const harness = cartHarness();
  harness.add({ id: 'retail-only', parent_id: 'parent-tank', variant_type: 'ciego', name: 'Tanque Ciego', category: 'Tanques', price: 12345 });
  const item = harness.cart[0];
  assert.equal(item.productId, 'retail-only');
  assert.equal(item.priceList, 12345);
  assert.equal(item.quantity, 1);
  assert.equal(item.catalogSource, 'minorista');
  assert.equal(item.allowsCiego, false);
});

test('Adding a retail product again increases quantity and preserves the negotiated price', () => {
  const harness = cartHarness([{ id: 'row', productId: 'retail', variant: 'standard', quantity: 2, customPrice: 800, priceList: 1000 }]);
  harness.add({ id: 'retail', name: 'Accesorio', category: 'Otros', price: 1200 });
  assert.equal(harness.cart.length, 1);
  assert.equal(harness.cart[0].quantity, 3);
  assert.equal(harness.cart[0].customPrice, 800);
  assert.equal(harness.cart[0].priceList, 1000);
});

test('Discontinued retail products cannot exceed available stock', () => {
  const harness = cartHarness();
  const product = { id: 'last-unit', name: 'Accesorio', category: 'Otros', price: 100, is_discontinued: true, stock_current: 1 };
  harness.add(product);
  harness.add(product);
  assert.equal(harness.cart[0].quantity, 1);
});

test('Retail origin survives quote save/reopen and both forms expose the picker', () => {
  assert.match(quoteSource, /catalogSource: item\.catalogSource/);
  assert.match(quoteSource, /item\.metadata\?\.catalogSource !== 'minorista'/);
  assert.match(quoteSource, /onAddRetailProduct=\{handleAddRetailProduct\}/);
  const orders = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
  assert.match(orders, /retailProducts=\{allProducts\}/);
  const modal = fs.readFileSync('src/components/vendedores/VisualProductSelectorModal.tsx', 'utf8');
  assert.match(modal, /isWholesaleContext && catalogSource === 'minorista'/);
  assert.match(modal, /onAddRetailProduct \|\| onAddProduct/);
});
