const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(source, context) {
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
}
const config = {};
compile(fs.readFileSync('src/lib/visualSelectorConfig.ts', 'utf8'), { exports: config });

test('Wholesale kits reuse the configured retail components and current kit price', () => {
  const products = [
    { id: 'kit', name: 'Kit Instalación Biodigestor Convencional 3000L', price: 4900000 },
    { id: 'bio', name: 'BioFort - Biodigestor 3000L', price: 832400 },
    { id: 'septic', name: 'BioFort - Séptica 3000L', price: 690000 },
    { id: 'wp', name: 'WP - Camara Desengrasadora C/canasto', price: 105000 },
    { id: 'pipe', name: 'Awaduct - Caño 110 4mts', price: 24000 },
    { id: 'cupla', name: 'Awaduct - Cupla 110', price: 6100 }
  ];
  const retail = { families: [{ subgroups: [{ id: 'kits_instalacion', items: [{
    isCombo: true, comboItems: [
      { productId: 'kit', quantity: 1, customPrice: 1 },
      { productId: 'bio', quantity: 1 }, { productId: 'septic', quantity: 1 },
      { productId: 'wp', quantity: 1 }, { productId: 'pipe', quantity: 5 },
      { productId: 'cupla', quantity: 2 }
    ]
  }] }] }] };
  const result = config.generateWholesaleVisualConfig(products, retail);
  const items = result.families.flatMap(f => f.subgroups.flatMap(s => s.items));
  const kit = items.find(i => i.productId === 'kit');
  assert.equal(items.filter(i => i.productId === 'kit').length, 1);
  assert.equal(kit.comboItems[0].customPrice, 4900000);
  assert.equal(kit.comboItems.find(i => i.productId === 'pipe').quantity, 5);
  assert.equal(kit.comboItems.find(i => i.productId === 'cupla').quantity, 2);
  assert.ok(kit.comboItems.slice(1).every(i => i.customPrice === 0));
  assert.ok(items.some(i => i.productId === 'cupla' && !i.isCombo));
});

const quote = fs.readFileSync('src/app/vendedores/presupuestos-mayorista/page.tsx', 'utf8');
const ast = ts.createSourceFile('quote.tsx', quote, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}
test('Wholesale quote preserves kit quantities, included price and separate coupling sales', () => {
  let cart = [];
  const context = {
    products: ['kit', 'cupla'].map(id => ({ id, name: id, priceList: id === 'kit' ? 4900000 : 6100,
      priceCorralon: 6100, priceDistributor: 6100, catalogSource: 'minorista' })),
    setCartItems: updater => { cart = updater(cart); },
    getWholesaleCatalogKind: () => null
  };
  compile(`const handleAddToCart = ${callback('handleAddToCart')};
    const handleAddVisualProduct = ${callback('handleAddVisualProduct')};
    const handleRemoveItem = ${callback('handleRemoveItem')};
    const handleUpdateQuantity = ${callback('handleUpdateQuantity')};
    handleAddVisualProduct({ id: 'kit', quantity: 1, customPrice: 4900000 });
    handleAddVisualProduct({ id: 'cupla', quantity: 2, customPrice: 0, isIncludedInKit: true, bundleParentId: 'kit', baseQuantity: 2 });
    handleAddVisualProduct({ id: 'cupla' });
    exports.update = handleUpdateQuantity; exports.remove = handleRemoveItem;`, { ...context, exports: context });
  assert.equal(cart.length, 3);
  assert.equal(cart[1].quantity, 2);
  assert.equal(cart[1].customPrice, 0);
  assert.equal(cart[2].quantity, 1);
  context.update(cart[0].id, 3);
  assert.equal(cart[1].quantity, 6);
  context.remove(cart[0].id);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].priceList, 6100);
});

test('Catalog supplements missing kits and coupling at retail prices and keeps published prices', async () => {
  const exported = {};
  const published = [ { erp_product_id: 'cupla', product_name: 'Awaduct - Cupla 110',
    price_list: 5000, price_corralon: 4750, price_distributor: 4500 } ];
  const extras = [ { id: 'cupla', name: 'Awaduct - Cupla 110', price: 6100 },
    { id: 'kit', name: 'Kit Instalación Biodigestor Convencional 3000L', price: 4900000 } ];
  const db = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: { id: 'list', list_number: '12' } }; },
      async order() { return { data: published }; },
      async or() { return { data: extras }; }
    };
    return query;
  } };
  compile(fs.readFileSync('src/app/api/vendedores/wholesale-catalog/route.ts', 'utf8'), {
    exports: exported, URL, process: { env: {} },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: value => value } };
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/lib/erp/prices') return { calculateBulkPrices: async (_, products, source) => {
        assert.equal(source, 'minorista');
        assert.equal(products.length, 1);
        return { kit: { price: 4900000 } };
      } };
      throw new Error(name);
    }
  });
  const result = await exported.GET({ url: 'http://localhost/api/vendedores/wholesale-catalog' });
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].priceList, 5000);
  assert.equal(result.products[1].priceList, 4900000);
  assert.equal(result.products[1].priceCorralon, 4900000);
  assert.equal(result.products[1].catalogSource, 'minorista');
});
