const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { getTankBaseWarnings: warnings, getBaseDiameterCm } = load('src/lib/tankBaseCompatibility.ts');
const item = (name, quantity = 1) => ({ name, quantity });

test('changing a 500 L tank to 1000 L warns about the retained 85 cm base', () => {
  const base = item('Base de Hierro 85cms');
  assert.equal(warnings([item('Tanque Tricapa Gris 500L'), base]).length, 0);
  const result = warnings([item('Tanque Tricapa Gris 1000L'), base]);
  assert.equal(result.length, 1);
  assert.match(result[0].message, /base de 102 cm/);
  assert.equal(warnings([item('Tanque Tricapa Gris 1000L'), item('Base de Hierro 102cms')]).length, 0);
});

test('opening an existing incompatible order warns without needing an item change', () => {
  assert.equal(warnings([item('TANQ TRIC GRIS 1000 L CIEGO'), item('Base Hierro 85 cm')]).length, 1);
  assert.equal(warnings([item('Tanque Bicapa 500L'), item('Base Hierro 102 cm')]).length, 1);
});

test('multiple tanks allow bases for either tank; unrelated bases are flagged', () => {
  const tanks = [item('Tanque Tricapa 500L'), item('Tanque Cuatricapa 1000L')];
  assert.equal(warnings([...tanks, item('Base Hierro 85cm'), item('Base Hierro 102cm')]).length, 0);
  assert.equal(warnings([...tanks, item('Base Hierro 74cm')]).length, 1);
});

test('standalone bases, special shapes, services and zero quantity do not infer incompatibility', () => {
  const base = item('Base Hierro 85cm');
  for (const name of ['Biodigestor 1000L', 'Termotanque 1000L', 'Cisterna 1000L', 'Tanque Slim 1000L', 'Tanque Chato 1000L', 'Instalación tanque 1000L', 'Tanque sin capacidad']) {
    assert.equal(warnings([item(name), base]).length, 0, name);
  }
  assert.equal(warnings([base]).length, 0);
  assert.equal(warnings([item('Tanque 1000L', 0), base]).length, 0);
  assert.equal(warnings([item('Tanque 1000L'), item('Base Hierro 85cm', 0)]).length, 0);
});

test('diameter parsing handles catalog spelling without partial numeric matches', () => {
  for (const name of ['Base de Hierro 102cms', 'Base Hierro 102 cm', 'Base Hierro 102']) assert.equal(getBaseDiameterCm({ name }), 102);
  assert.equal(getBaseDiameterCm({ name: 'Base Hierro 1020' }), undefined);
  assert.equal(getBaseDiameterCm({ name: 'Tanque 102L' }), undefined);
});
