const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('the historical sheet receives requests before approval and operational sheets only receive approved orders', async () => {
  const calls = [];
  const operational = [];
  const exports = {};
  const dependencies = {
    googleSheets: {
      getGoogleAccessToken: async () => 'token',
      upsertEmployeeWithdrawalInOperationalSheets: async (_, payload) => { calls.push('operational'); operational.push(payload); },
      removeEmployeeWithdrawalFromOperationalSheets: async () => { calls.push('remove operational'); },
    },
    advertisingSources: { EMPLOYEE_WITHDRAWAL_SOURCE: 'Retiro de empleado' },
    dateFields: { displayDateField: value => value },
    employeeWithdrawals: { EMPLOYEE_WITHDRAWAL_PAYMENT: 'Descuento Sueldo', employeeReviewLabels: {} },
    legacyWithdrawalSheet: { writeLegacyWithdrawal: async (_, snapshot) => { calls.push(snapshot.state); } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/employeeWithdrawalSheets.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, process: { env: {} }, require: name => dependencies[name.split('/').at(-1)] });

  const order = { code: 'RMRH00156', total: 95, items: [{ name: 'Escalera', quantity: 1, price: 100 }] };
  await exports.syncEmployeeWithdrawalSheets({ ...order, state: 'pending' });
  await exports.syncEmployeeWithdrawalSheets({ ...order, state: 'approved' });
  await exports.syncEmployeeWithdrawalSheets({ ...order, state: 'returned', reconcile_operational: true });
  assert.deepEqual(calls, ['pending', 'operational', 'approved', 'returned', 'remove operational']);

  calls.length = 0;
  await exports.syncEmployeeWithdrawalSheets({ ...order, state: 'approved', beneficiary_type: 'personal' });
  assert.deepEqual(calls, ['operational']);
  const personal = operational.at(-1);
  assert.equal(personal.withoutCollection, true);
  assert.equal(personal.items[0].unitPrice, 0);
  assert.equal(personal.paymentMethod, 'Sin cobro en la entrega');
  assert.match(personal.deliveryNotes, /A nombre de Diego Bóveda/);
  assert.doesNotMatch(personal.deliveryNotes, /nómina|RR\. HH\./);
});
