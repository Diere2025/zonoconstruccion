const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports });
  return exports;
}
const { settlementDeliveryStatus, settlementOrdersTotal, settlementElectronicTicketTotals } = load('src/lib/settlementOrders.ts');
const { centralDeliveryOutcome } = load('src/lib/deliveryAttemptSync.ts');
const ticket = { amount: 743250, orderId: 'order', orderCode: 'JS25618', mpPaymentId: 'payment' };
for (const [status, reason, expected] of [
  ['fallido', 'postergado', 'postergado'],
  ['pendiente_ruteo', 'postergado', 'postergado'],
  ['en_recorrido', 'postergado', 'postergado'],
  ['pendiente_ruteo', null, 'pendiente_ruteo'],
  ['fallido', 'cancelado', 'cancelado'],
  ['anulado', null, 'anulado'],
]) {
  const deliveryStatus = settlementDeliveryStatus(status, reason);
  assert.equal(deliveryStatus, expected);
  const order = { orderId: 'order', orderCode: 'JS25618', totalAmount: 743250, deliveryStatus };
  assert.equal(settlementOrdersTotal([order]), 0);
  const totals = settlementElectronicTicketTotals([ticket], [order]);
  assert.equal(totals.included, 0);
  assert.equal(totals.excluded, 743250);
  assert.equal(ticket.amount, 743250, 'Preserve payment evidence, not delete the ticket');
}
assert.equal(settlementDeliveryStatus('entregado', 'postergado'), 'entregado');
assert.equal(settlementElectronicTicketTotals([ticket], [{ orderId: 'order', deliveryStatus: 'entregado' }]).included, 743250);
assert.equal(settlementElectronicTicketTotals([ticket], [{ orderId: 'order', deliveryStatus: 'postergado', isPreviouslyPaid: true }]).included, 0);
assert.equal(settlementElectronicTicketTotals([ticket], [{ orderId: 'other', deliveryStatus: 'postergado' }]).included, 743250);
assert.equal(settlementElectronicTicketTotals([{ amount: 743250 }], [{ orderId: 'order', deliveryStatus: 'postergado' }]).included, 743250, 'Equal amount alone must never identify a payment');
assert.equal(settlementElectronicTicketTotals([{ amount: 200, mpPaymentId: 'payment' }], [{ deliveryStatus: 'postergado', linkedPayments: [{ id: 'payment' }] }]).included, 0);
assert.equal(settlementElectronicTicketTotals([{ amount: 100, orderCode: ' js25618 ' }], [{ orderCode: 'JS25618', deliveryStatus: 'Anulado' }]).included, 0);
for (const [previous, next] of [['Entregando', 'Entregando'], ['Pendiente', 'Entregando'], ['Entregando', 'Pendiente'], ['Confirmado', 'Pendiente']]) {
  assert.equal(centralDeliveryOutcome(previous, next), null, 'Do not rewrite an attempt on metadata/rerouting updates');
}
assert.equal(centralDeliveryOutcome('Entregando', 'Entregado').failure_reason, null);
assert.equal(centralDeliveryOutcome('Entregando', 'Cancelado').failure_reason, 'cancelado');
// Production regression: exclude postponed payment and keep the genuine $50.
const electronic = settlementElectronicTicketTotals([ticket, { amount: 2114791 }], [{ orderId: 'order', deliveryStatus: settlementDeliveryStatus('pendiente_ruteo', 'postergado') }]);
assert.equal(1434800 + 7750 - (3517391 + 40000 - electronic.included), -50);
console.log('OK: pago previo, postergado/reruteado, anulado, identificación de tickets, sincronización y diferencia real de -$50.');
