const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const start = source.indexOf('  const paymentsWithSurcharges = paymentsList.map');
const end = source.indexOf('  const surcharge = totalSurcharges;', start);
assert.ok(start >= 0 && end > start);
const calculation = ts.transpileModule(
  source.slice(start, end) + '\nglobalThis.result = { paymentsWithSurcharges, ivaAmount, total };',
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function calculate(paymentsList, includeIVA = false) {
  const subtotal = paymentsList.reduce((sum, payment) => sum + payment.amount, 0);
  const context = { paymentsList, includeIVA, subtotal, orderBaseAmount: subtotal, shippingAmount: 0, dbPaymentMethods: [] };
  vm.runInNewContext(calculation, context);
  return context.result;
}

test('JS26330 amount adds 21% even with a legacy included flag or no mode', () => {
  for (const iva_mode of ['included', 'added', undefined]) {
    const result = calculate([{ amount: 159000, has_iva: true, iva_mode }]);
    assert.equal(result.ivaAmount, 33390);
    assert.equal(result.total, 192390);
    assert.equal(result.paymentsWithSurcharges[0].taxableBase, 159000);
    assert.equal(result.paymentsWithSurcharges[0].iva_mode, 'added');
  }
});

test('only the invoiced payment adds IVA in a mixed order', () => {
  const result = calculate([{ amount: 159000, has_iva: true }, { amount: 139000, has_iva: false }]);
  assert.equal(result.ivaAmount, 33390);
  assert.equal(result.total, 331390);
});

test('global IVA is added once and payments without IVA retain their amount', () => {
  assert.equal(calculate([{ amount: 159000, has_iva: true }], true).total, 192390);
  const result = calculate([{ amount: 159000, has_iva: false }]);
  assert.equal(result.ivaAmount, 0);
  assert.equal(result.total, 159000);
});
