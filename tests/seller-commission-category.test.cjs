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
test('termotanques belong to their own group rather than water tanks', () => {
  for (const c of ['TERMOTANQUES', 'Termotanques eléctricos', 'Termotanque a gas']) assert.equal(normalize(c), 'Termotanques');
});
test('water tanks and installation services preserve their categories', () => {
  assert.equal(normalize('Tanques Tricapa'), 'Tanques de Agua');
  assert.equal(normalize('Tanques Cisterna'), 'Tanques de Agua');
  assert.equal(normalize('Instalación termotanque'), 'Instalaciones');
  assert.equal(normalize('Herramientas'), 'Herramientas');
});
