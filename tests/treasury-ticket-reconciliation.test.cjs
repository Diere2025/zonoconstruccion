const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileImportedTickets } = require('../src/lib/treasuryTicketReconciliation.ts');

test('reuses the unique imported ticket instead of counting the transfer twice', () => {
  const stored = [
    { id: '1', amount: 347900, reference: 'Ticket 1', payment_type: 'POINT' },
    { id: '2', amount: 50000, reference: 'Ticket 2', payment_type: 'POINT' },
    { id: '3', amount: 609950, reference: 'Ticket 3', payment_type: 'POINT' },
  ];
  const payment = { id: 'mp-1', amount: 609950, payment_type: 'TRANSFERENCIA', order_code: 'JS25621' };
  const result = reconcileImportedTickets(stored, [payment], 'spreadsheet');

  assert.equal(result.unmatchedPayments.length, 0);
  assert.equal(result.tickets.length, 3);
  assert.equal(result.tickets[2].mp_payment_id, 'mp-1');
  assert.equal(result.tickets[2].order_code, 'JS25621');
  assert.equal(result.tickets[2].payment_type, 'TRANSFERENCIA');
  assert.equal(result.tickets.reduce((sum, ticket) => sum + ticket.amount, 0), 1007850);
  assert.equal(stored[2].mp_payment_id, undefined);
});

test('does not guess when more than one ticket has the same amount', () => {
  const stored = [
    { amount: 609950, reference: 'Ticket 1' },
    { amount: 609950, reference: 'Ticket 2' },
  ];
  const payment = { id: 'mp-1', amount: 609950, order_code: 'JS25621' };
  const result = reconcileImportedTickets(stored, [payment], 'spreadsheet');
  assert.equal(result.unmatchedPayments.length, 1);
  assert.equal(result.tickets[0].mp_payment_id, undefined);
  assert.equal(result.tickets[1].mp_payment_id, undefined);
});

test('does not merge independent payments merely because they share an amount', () => {
  const stored = [{ amount: 609950, reference: 'Ticket 1' }];
  const payments = [
    { id: 'mp-1', amount: 609950, order_code: 'JS25621' },
    { id: 'mp-2', amount: 609950, order_code: 'JS25622' },
  ];
  const result = reconcileImportedTickets(stored, payments, 'spreadsheet');
  assert.equal(result.unmatchedPayments.length, 2);
  assert.equal(result.tickets[0].mp_payment_id, undefined);
});

test('does not infer a link for manually entered tickets', () => {
  const result = reconcileImportedTickets(
    [{ amount: 609950, reference: 'Ticket 1' }],
    [{ id: 'mp-1', amount: 609950, order_code: 'JS25621' }],
    'manual',
  );
  assert.equal(result.unmatchedPayments.length, 1);
});
