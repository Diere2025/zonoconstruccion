const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/financialAccountLabels.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsModule });
const { financialAccountLabel } = exportsModule;

test('account labels omit Caja without changing original names or other words', () => {
  const account = { id: 'cash', name: 'Caja Efectivo Pesos' };
  assert.equal(financialAccountLabel(account.name), 'Efectivo Pesos');
  assert.equal(account.name, 'Caja Efectivo Pesos');
  assert.equal(account.id, 'cash');
  assert.equal(financialAccountLabel('CAJA  Efectivo Dólares'), 'Efectivo Dólares');
  assert.equal(financialAccountLabel('Banco Macro'), 'Banco Macro');
  assert.equal(financialAccountLabel('Cajamarca'), 'Cajamarca');
});
