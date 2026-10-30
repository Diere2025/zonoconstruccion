const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const model = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/georef.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: model, URL, Error });

test('geographic searches normalize accents and bound a fixed public upstream', () => {
  assert.equal(model.normalizeGeography(' CÓRDOBA '), 'cordoba');
  const url = model.georefUrl('localities', ' rosario ', '82');
  assert.equal(url.origin, 'https://apis.datos.gob.ar');
  assert.equal(url.pathname, '/georef/api/v2.0/localidades');
  assert.equal(url.searchParams.get('nombre'), 'rosario');
  assert.equal(url.searchParams.get('provincia'), '82');
  assert.equal(url.searchParams.get('max'), '20');
  assert.equal(model.georefUrl('localities', 'rosario', '').searchParams.has('provincia'), false);
  for (const args of [['https://example.com', '', ''], ['localities', 'x', ''], ['localities', 'x'.repeat(81), ''], ['localities', 'rosario', 'x'.repeat(81)]]) assert.throws(() => model.georefUrl(...args));
});

test('results provide province and department context without inventing a postal code', () => {
  const results = model.georefResults('localities', { localidades: [
    { id: 'rosario', nombre: 'Rosario', provincia: { id: '82', nombre: 'Santa Fe' }, departamento: { nombre: 'Rosario' } },
    { id: 'invalid', nombre: 'Incomplete locality' },
  ] });
  assert.equal(results.length, 1);
  assert.equal(results[0].province.name, 'Santa Fe');
  assert.equal(results[0].department, 'Rosario');
  assert.equal(results[0].postal_code, undefined);
  assert.throws(() => model.georefResults('provinces', {}));
  assert.equal(model.georefResults('provinces', { provincias: [{ id: '14', nombre: 'Córdoba' }] })[0].name, 'Córdoba');
});
