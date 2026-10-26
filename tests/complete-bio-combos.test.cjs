const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function compile(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports });
  return exports;
}
const { generateDefaultVisualConfig, includeCompleteBioCombos, includeInstallationKitCuplas } = compile('src/lib/visualSelectorConfig.ts');
const { evaluateDiscountSuggestions } = compile('src/lib/discountRules.ts');
const products = [];
function product(id, name, price = 10000) { products.push({ id, name, price, is_active: true }); }
for (const size of [500, 600, 750, 1000, 3000]) {
  product(`kit${size}`, `Kit Instalación Biodigestor Convencional ${size}L`, 4900000);
  product(`bio${size}`, `BioFort - Biodigestor ${size}L`, size * 100);
  product(`sep${size}`, `BioFort - Séptica ${size}L`, size * 50);
}
product('auto', 'BioFort - Autolimpiable 700L', 489600);
product('lodos', 'BioFort - Registro de Lodos', 56700);
product('wrong-grease', 'PVC - Desengrasadora 3 Bocas (D3B)', 17400);
product('wrong-inspection', 'Powerlit CAMARA INSPECCIÓN', 54000);
product('grease', 'WP - Camara Desengrasadora C/canasto', 105000);
product('inspection', 'WP Kit cámara de inspección CII', 54000);
product('pipe', 'Awaduct - Caño 110 4mts');
product('tee', 'Awaduct - Ramal T 110');
product('elbow45', 'Awaduct - Codo 110 MH 45°');
product('elbow90', 'Awaduct - Codo 110 MH 90°');
product('coupling', 'Awaduct - Cupla 110');
product('cap', 'Awaduct - Sombrero 110');
product('lube', 'Lusqtoff - Aerosol lubricante');
product('biolam', 'Biolam - Concentrado Enzimático 500g', 18500);
const group = config => config.families.find(f => f.id === 'biodigestores').subgroups.find(s => s.id === 'combos_completos');

test('Six complete supply combos charge each component, discount only bios and cameras, and match reference quantities', () => {
  const config = generateDefaultVisualConfig(products);
  const combos = group(config).items;
  assert.equal(combos.length, 6);
  assert.equal(combos.map(i => i.label.match(/^\d+/)[0]).join(','), '700,500,600,750,1000,3000');
  for (const combo of combos) {
    assert.equal(combo.isActive, true);
    const size = Number(combo.id.split('_').at(-1));
    const auto = size === 700;
    const items = combo.comboItems;
    assert.equal(items.length, auto ? 11 : 12);
    assert.equal(items[0].productId, auto ? 'auto' : `bio${size}`);
    assert.equal(items[1].productId, auto ? 'lodos' : `sep${size}`);
    assert.equal(items[2].productId, 'grease');
    assert.equal(items[3].productId, 'inspection');
    assert.equal(items.find(i => i.productId === 'pipe').quantity, size === 3000 ? 5 : size === 1000 ? 4 : 3);
    for (const id of ['elbow45', 'elbow90']) assert.equal(items.find(i => i.productId === id).quantity, 2);
    assert.equal(items.some(i => i.productId === 'cap'), !auto);
    assert.equal(items.find(i => i.productId === 'coupling').quantity, 2);
    for (const [index, item] of items.entries()) {
      const p = products.find(p => p.id === item.productId);
      assert.ok(p.price > 0);
      if (index < 4) {
        assert.equal(item.customPrice, Math.round(p.price * .85));
        assert.equal(item.basePrice, p.price);
        assert.equal(item.discountValue, 15);
      } else {
        assert.equal(item.customPrice, undefined);
        assert.equal(item.discountValue, undefined);
      }
    }
    const order = items.map(i => {
      const p = products.find(p => p.id === i.productId);
      return { ...p, ...i, id: p.id, customPrice: i.customPrice ?? p.price };
    });
    assert.equal(evaluateDiscountSuggestions(order, products).some(s => s.ruleId === 'combo-biofort-15'), false);
  }
  assert.ok(group(includeInstallationKitCuplas(config, products)).items.every(i => i.comboItems.every(c => c.customPrice !== 0)));
});

test('Existing saved catalog receives the line once and uses refreshed catalog prices', () => {
  const saved = { families: [{ id: 'biodigestores', name: 'Biodigestores', subgroups: [{ id: 'custom', items: [] }] }] };
  const updated = includeCompleteBioCombos(saved, products);
  assert.equal(group(updated).items.filter(i => i.id === 'combo_completo_convencional_500').length, 1);
  const twice = includeCompleteBioCombos(updated, products.map(p => p.id === 'bio600' ? { ...p, price: 100000 } : p));
  assert.equal(twice.families[0].subgroups.length, 4);
  assert.equal(group(twice).items.find(i => i.id.endsWith('_600')).comboItems[0].customPrice, 85000);
  assert.equal(saved.families[0].subgroups.length, 1);
});

test('Incomplete or unpriced bundles cannot be added as a partial combo', () => {
  for (const catalog of [products.filter(p => p.id !== 'biolam'), products.map(p => p.id === 'biolam' ? { ...p, price: 0 } : p)]) {
    for (const combo of group(generateDefaultVisualConfig(catalog)).items) {
      assert.equal(combo.isActive, false);
      assert.equal(combo.comboItems.length, 0);
    }
  }
});

test('Legacy BioFort discount suggestion remains available for full-price individual purchases', () => {
  const order = ['bio600', 'sep600', 'inspection', 'biolam'].map(id => {
    const p = products.find(p => p.id === id);
    return { ...p, quantity: 1, customPrice: p.price };
  });
  assert.equal(evaluateDiscountSuggestions(order, products).some(s => s.ruleId === 'combo-biofort-15'), true);
});

test('Basic COMBOS covers all six models with three priced products and no accessories', () => {
  const config = includeCompleteBioCombos({ families: [{ id: 'biodigestores', name: 'Biodigestores', subgroups: [{ id: 'combos_biofort', isActive: true, items: [{ id: 'old', price: 1 }] }] }] }, products);
  const basic = config.families[0].subgroups.find(s => s.id === 'combos_biofort');
  assert.equal(basic.items.length, 6);
  assert.equal(basic.showItemImages, false);
  assert.equal(basic.quickAddItems.length, 1);
  assert.equal(basic.quickAddItems[0].label, 'WP - Camara Desengrasadora C/canasto');
  assert.equal(basic.quickAddItems[0].comboItems.length, 1);
  assert.equal(basic.quickAddItems[0].comboItems[0].productId, 'grease');
  assert.equal(basic.quickAddItems[0].comboItems[0].customPrice, 89250);
  assert.equal(basic.quickAddItems[0].comboItems[0].discountValue, 15);
  for (const combo of basic.items) {
    assert.equal(combo.isActive, true);
    const size = Number(combo.label.match(/^\d+/)[0]);
    assert.equal(combo.comboItems.map(i => i.productId).join(','), [size === 700 ? 'auto' : `bio${size}`, size === 700 ? 'lodos' : `sep${size}`, 'inspection'].join(','));
    assert.equal(combo.price, undefined);
    for (const item of combo.comboItems) {
      assert.equal(item.quantity, 1);
      assert.equal(item.customPrice, Math.round(products.find(p => p.id === item.productId).price * .85));
      assert.equal(item.discountValue, 15);
    }
  }
  assert.equal(includeCompleteBioCombos(config, products).families[0].subgroups.filter(s => s.id === 'combos_biofort').length, 1);
});

test('Biolam menu covers all six models with four discounted products', () => {
  const config = generateDefaultVisualConfig(products);
  const biolam = config.families.flatMap(f => f.subgroups).find(s => s.id === 'combos_con_biolam');
  assert.equal(biolam.items.length, 6);
  assert.equal(biolam.items.map(i => i.label.match(/^\d+/)[0]).join(','), '500,600,700,750,1000,3000');
  for (const item of biolam.items) {
    assert.equal(item.isActive, true);
    assert.equal(item.comboItems.length, 4);
    const size = Number(item.label.match(/^\d+/)[0]);
    assert.equal(item.comboItems[0].productId, size === 700 ? 'auto' : `bio${size}`);
    assert.equal(item.comboItems[1].productId, size === 700 ? 'lodos' : `sep${size}`);
    assert.equal(item.comboItems.at(-1).productId, 'biolam');
    assert.equal(item.comboItems.at(-1).customPrice, 15725);
    assert.ok(item.comboItems.every(i => i.discountValue === 15 && i.customPrice > 0));
  }
  const twice = includeCompleteBioCombos(config, products);
  assert.equal(twice.families.flatMap(f => f.subgroups).filter(s => s.id === 'combos_con_biolam').length, 1);
  const missing = includeCompleteBioCombos(config, products.filter(p => p.id !== 'biolam'));
  assert.ok(missing.families.flatMap(f => f.subgroups).find(s => s.id === 'combos_con_biolam').items.every(i => !i.isActive && !i.comboItems.length));
});
