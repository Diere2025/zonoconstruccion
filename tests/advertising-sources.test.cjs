const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/advertisingSources.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const { advertisingSourcesForChannel, sortAdvertisingSources } = exportsObject;
const source = (id, name, channel, sort_order, is_active = true) => ({ id, name, channel, sort_order, is_active });

test('new names configured in settings appear in the selected channel and saved order', () => {
  const sources = [source('1', 'Mayorista', 'minorista', 4), source('2', 'Nueva campaña', 'minorista', 1),
    source('3', 'Meta - Látex Zono', 'minorista', 3), source('4', 'Otra', 'ambos', 2),
    source('5', 'Cliente', 'mayorista', 5), source('6', 'Inactiva', 'minorista', 0, false)];
  assert.deepEqual(Array.from(advertisingSourcesForChannel(sources, 'minorista'), s => s.name),
    ['Nueva campaña', 'Otra', 'Meta - Látex Zono', 'Mayorista']);
  assert.deepEqual(Array.from(advertisingSourcesForChannel(sources, 'mayorista'), s => s.name), ['Otra', 'Cliente']);
  assert.equal(sources[0].name, 'Mayorista');
});

test('renaming a source preserves its channel and position', () => {
  const sources = [source('1', 'Cliente renombrado', 'mayorista', 1), source('2', 'Cliente', 'minorista', 2)];
  assert.equal(advertisingSourcesForChannel(sources, 'mayorista')[0].name, 'Cliente renombrado');
  assert.equal(advertisingSourcesForChannel(sources, 'minorista')[0].name, 'Cliente');
});

test('disabled and empty options stay absent; legacy data has a compatible channel', () => {
  assert.equal(advertisingSourcesForChannel([], 'minorista').length, 0);
  assert.equal(advertisingSourcesForChannel([source('1', 'Meta - Látex Zono', 'minorista', 1, false)], 'minorista').length, 0);
  const legacy = [source('1', 'Cliente'), source('2', 'Meta - Látex Zono')];
  assert.equal(advertisingSourcesForChannel(legacy, 'minorista')[0].id, '2');
  assert.equal(advertisingSourcesForChannel(legacy, 'mayorista')[0].id, '1');
  assert.equal(sortAdvertisingSources(legacy).length, 2);
});
