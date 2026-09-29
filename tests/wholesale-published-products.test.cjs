const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/visualSelectorConfig.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exportsObject });

test('Published Konan pump and unclassified products remain selectable in the visual catalog', () => {
  const products = [
    { id: 'konan', name: 'Konan - Bomba Periferica 1/2 HP (KBP12)', category: 'Otros', price: 50900 },
    { id: 'new-product', name: 'Nuevo producto publicado', category: 'Otros', price: 12300 },
    { id: 'float', name: 'Flotante Eco Varilla Plástica 1/2', category: 'Flotantes', price: 5000 }
  ];
  const config = exportsObject.generateWholesaleVisualConfig(products);
  const items = config.families.flatMap(family => family.subgroups.flatMap(subgroup => subgroup.items));
  for (const product of products) {
    assert.equal(items.filter(item => item.productId === product.id).length, 1, product.name);
  }
  const others = config.families.find(family => family.id === 'otros_mayorista');
  assert.ok(others.subgroups[0].items.some(item => item.productId === 'konan'));
  assert.equal(exportsObject.getWholesaleCatalogKind(products[0]), null);
});

test('Orders and quotes do not discard published rows based on visual family', () => {
  const orders = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
  const quotes = fs.readFileSync('src/app/vendedores/presupuestos-mayorista/page.tsx', 'utf8');
  assert.doesNotMatch(orders, /data\.products\.filter\([^;]+getWholesaleCatalogKind/);
  assert.doesNotMatch(quotes, /\.filter\(\(p: any\)[\s\S]*?getWholesaleCatalogKind\(p\)/);
});
