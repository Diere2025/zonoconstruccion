const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const exportsValue = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/erpNavigation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsValue, require, URLSearchParams });

test('future planning is visible only to its exact owner', () => {
  const { visibleErpModules } = exportsValue;
  const links = userId => visibleErpModules({ roles: ['admin'], restrictedSeller: false, canUseWholesale: true, userId })
    .flatMap(module => module.links.map(link => link.href));
  const owner = '381df0d1-183f-4ccb-aaf2-8147c76159a9';
  assert.ok(links(owner).includes('/desarrollos-futuros'));
  assert.ok(!links('11111111-1111-4111-8111-111111111111').includes('/desarrollos-futuros'));
  assert.ok(!links(null).includes('/desarrollos-futuros'));
});
