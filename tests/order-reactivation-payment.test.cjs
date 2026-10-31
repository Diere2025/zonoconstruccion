const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, requireModule = require) {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText)(exports, requireModule);
  return exports;
}
const payment = load('src/lib/orderDeclaredPayment.ts');
const original = {
  id: 'order', legacy_code: 'JS26270', status: 'Pendiente', payment_status: 'Pendiente',
  total_amount: '245000.00', totals: { deposit_amount: 0, payment_timing: 'contra_entrega',
    pending_balance: 245000, payments_breakdown: [{ amount: 245000, receipt_url: '' }] }
};

test('reactivation sends zero collected to all sheets for JS26270 contra entrega', async () => {
  const calls = [];
  const { processOrderReactivation } = load('src/lib/processOrderReactivation.ts', name => {
    if (name === '@/lib/orderDeclaredPayment') return payment;
    if (name === '@/lib/googleSheets') return { reactivateOrderInAllSheets: async (...args) => {
      calls.push(args); return { seller: { success: true }, central: [], deliveriesCurrent: [] };
    } };
    throw Error('Unexpected dependency ' + name);
  });
  const records = {
    orders: original,
    order_items: [{ product_name: 'Termotanque', quantity: 1, unit_price: 245000 }],
    order_sync_jobs: { payload: { order: { paymentStatus: 'Abonado', depositOrPaidAmount: 245000 } } },
    sellers: { full_name: 'Jazmín' }
  };
  const db = { from(table) {
    const result = { data: records[table] || null, error: null };
    const query = { select() { return this; }, eq() { return this; },
      single: async () => result, maybeSingle: async () => result,
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    return query;
  } };
  await processOrderReactivation(db, 'order', 'seller');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].paymentStatus, 'No Abonado');
  assert.equal(calls[0][2].depositOrPaidAmount, 0);
  assert.equal(original.totals.pending_balance, 245000);
});

test('partial payment uses only the deposit despite a full planned breakdown', () => {
  assert.deepEqual(payment.orderDeclaredPayment({ ...original, payment_status: 'Seniado',
    totals: { ...original.totals, deposit_amount: 50000 } }),
  { paymentStatus: 'Señado', depositOrPaidAmount: 50000 });
});

test('paid orders include the full total including surcharges', () => {
  assert.deepEqual(payment.orderDeclaredPayment({ ...original, payment_status: 'Abonado',
    total_amount: 269500 }), { paymentStatus: 'Abonado', depositOrPaidAmount: 269500 });
});

test('stale deposits and unknown payment states cannot mark an unpaid order paid', () => {
  for (const status of ['Pendiente', 'No Abonado', null, undefined, 'otro']) {
    assert.equal(payment.orderDeclaredPayment({ ...original, payment_status: status,
      totals: { deposit_amount: 245000 } }).depositOrPaidAmount, 0);
  }
  for (const value of [-1, 'NaN', Infinity, undefined]) {
    assert.equal(payment.orderDeclaredPayment({ ...original, payment_status: 'Seniado',
      totals: { deposit_amount: value } }).depositOrPaidAmount, 0);
  }
});
