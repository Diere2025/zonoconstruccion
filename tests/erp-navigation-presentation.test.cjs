const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function readModule(path) {
  const result = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText, { exports: result, require, URLSearchParams });
  return result;
}
const { visibleErpModules } = readModule('src/lib/erpNavigation.ts');
const { presentErpModules } = readModule('src/lib/erpNavigationPresentation.ts');
const destinations = modules => modules.flatMap(module => module.links.map(link => link.id + ' ' + link.href)).sort();

test('pilot preserves authorized destinations for roles, individual restrictions and overrides', () => {
  for (const roles of [['admin'], ['seller'], ['logistica'], ['fletero'], ['administracion'], ['compras'], ['instalador'], ['compras', 'administracion']]) {
    for (const restrictedSeller of [false, true]) {
      const source = visibleErpModules({ roles, restrictedSeller, canUseWholesale: true,
        screenOverrides: { logistica: { 'logistica-via-cargo': false } } });
      const presented = presentErpModules(source);
      assert.deepEqual(Array.from(destinations(presented)), Array.from(destinations(source)));
      assert.ok(presented.every(module => module.links.length));
    }
  }
});

test('dispatch settings move out of operations and revocation removes them everywhere', () => {
  const identity = { roles: ['logistica'], restrictedSeller: false, canUseWholesale: false };
  const pilot = presentErpModules(visibleErpModules(identity));
  assert.ok(pilot.find(module => module.id === 'configuracion-logistica').links.some(link => link.id === 'logistica-via-cargo'));
  assert.ok(!pilot.find(module => module.id === 'logistica').links.some(link => link.id === 'logistica-via-cargo'));
  const revoked = presentErpModules(visibleErpModules({ ...identity,
    screenOverrides: { logistica: { 'logistica-via-cargo': false } } }));
  assert.ok(!destinations(revoked).some(value => value.startsWith('logistica-via-cargo ')));
});
