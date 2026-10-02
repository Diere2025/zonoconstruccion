const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sellerCommissionCategory.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exported });
const normalize = exported.normalizeCommissionCategory;
const resolve = exported.resolveCommissionProductCategory;
test('termotanques belong to their own group rather than water tanks', () => {
  for (const c of ['TERMOTANQUES', 'Termotanques eléctricos', 'Termotanque a gas']) assert.equal(normalize(c), 'Termotanques');
});
test('explicit product rules override catalog and order categories', () => {
  assert.equal(resolve('Konan - Bomba Periferica 1/2 HP (KBP12)', 'Tanques de Agua', 'TANQUES'), 'Herramientas');
  assert.equal(resolve('Adicionales Instalación Biofort', 'Instalaciones'), 'Adicionales sin comisión');
  assert.equal(resolve('Equilibrio Membrana Techos Beige (20Kg)', 'MEPS'), 'Pinturas');
  assert.equal(resolve('Equilibrio MEP FRENTES Gris (20Kg)', 'Otros'), 'Pinturas');
  assert.equal(resolve('WP Kit cámara de inspección CII', 'Otros'), 'Biodigestores');
  assert.equal(resolve('WP Tanque TRICAPA T750', 'Otros'), 'Tanques de Agua');
  assert.equal(resolve('Biolam - Concentrado Enzimático 500g', 'Otros'), 'Biodigestores');
  assert.equal(resolve('Kit Instalación Biodigestor Convencional 600L', 'Biodigestores'), 'Instalaciones');
});
test('water tanks and installation services preserve their categories', () => {
  assert.equal(normalize('Tanques Tricapa'), 'Tanques de Agua');
  assert.equal(normalize('Tanques Cisterna'), 'Tanques de Agua');
  assert.equal(normalize('Instalación termotanque'), 'Instalaciones');
  assert.equal(normalize('Herramientas'), 'Herramientas');
});
