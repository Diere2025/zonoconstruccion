const test = require('node:test');
const assert = require('node:assert/strict');
const { settlementPaymentReassignments } = require('../src/lib/settlementPaymentReassignment.ts');
const { isExcludedSettlementTicket } = require('../src/lib/settlementOrders.ts');

test('only explicit assignment changes are synchronized, retaining the concurrency baseline', () => {
  const corrected = { amount: 277000, mp_payment_id: 'payment-1', order_code: 'JS25914', order_id: 'order-2', original_order_code: 'JS25776', original_order_id: 'order-1' };
  assert.deepEqual(settlementPaymentReassignments([corrected]), [{ payment_id: 'payment-1', previous_order_code: 'JS25776', previous_order_id: 'order-1', order_code: 'JS25914', order_id: 'order-2' }]);
  assert.deepEqual(settlementPaymentReassignments([
    { ...corrected, original_order_code: undefined }, // untouched snapshot
    { ...corrected, mp_payment_id: null }, // manual ticket
    { ...corrected, order_code: ' js25776 ', order_id: 'order-1' }, // edit reverted
    { ...corrected, amount: 0 }, // not saved
  ]), []);
});

test('corrected ticket follows the new order while linkedPayments still contains the old assignment', () => {
  const orders = [
    { orderId: 'order-1', orderCode: 'JS25776', deliveryStatus: 'Postergado', linkedPayments: [{ id: 'payment-1' }] },
    { orderId: 'order-2', orderCode: 'JS25914', deliveryStatus: 'Entregado' },
  ];
  assert.equal(isExcludedSettlementTicket({ amount: 277000, mpPaymentId: 'payment-1', orderId: 'order-2', orderCode: 'JS25914' }, orders), false);
  assert.equal(isExcludedSettlementTicket({ amount: 277000, mpPaymentId: 'payment-1' }, orders), true);
});
