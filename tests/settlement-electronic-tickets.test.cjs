const test = require('node:test');
const assert = require('node:assert/strict');
const { isExcludedSettlementTicket, settlementElectronicTicketTotals } = require('../src/lib/settlementOrders.ts');

test('payment for a postponed order stays visible but does not reduce route cash', () => {
  const orders = [
    { orderId: 'order-1', orderCode: 'JS25618', deliveryStatus: 'postergado', linkedPayments: [{ id: 'mp-1' }] },
    { orderId: 'order-2', orderCode: 'JS25564', deliveryStatus: 'entregado' },
  ];
  const tickets = [
    { amount: 743250, orderId: 'order-1', orderCode: 'JS25618', mpPaymentId: 'mp-1' },
    { amount: 69000, orderId: 'order-2', orderCode: 'JS25564' },
  ];
  assert.deepEqual(settlementElectronicTicketTotals(tickets, orders), {
    included: 69000, excluded: 743250, excludedCount: 1,
  });
  assert.equal(tickets.length, 2);
});

test('cancelled orders are excluded while unlinked payments are not guessed by amount', () => {
  const orders = [{ orderId: 'order-1', orderCode: 'JS25618', deliveryStatus: 'Cancelado' }];
  assert.equal(isExcludedSettlementTicket({ amount: 743250, orderCode: 'JS25618' }, orders), true);
  assert.equal(isExcludedSettlementTicket({ amount: 743250, orderCode: null }, orders), false);
});

test('payment id links an excluded order even when the ticket has no order code', () => {
  const orders = [{ orderId: 'order-1', deliveryStatus: 'Anulado', linkedPayments: [{ id: 'mp-1' }] }];
  assert.equal(isExcludedSettlementTicket({ amount: 1000, mpPaymentId: 'mp-1' }, orders), true);
});
