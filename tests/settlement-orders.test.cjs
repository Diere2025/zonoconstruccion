const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/settlementOrders.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: lib });

test('postponed and cancelled deliveries do not increase the settlement', () => {
  assert.equal(lib.settlementOrdersTotal([
    { toCollectAmount: 100000, deliveryStatus: 'Entregado' },
    { toCollectAmount: 70000, deliveryStatus: 'Postergado (cliente)' },
    { toCollectAmount: 20000, deliveryStatus: 'ANULADO' },
    { toCollectAmount: 15000, deliveryStatus: 'No entregado' },
    { toCollectAmount: 12000, deliveryStatus: 'fallido' },
    { toCollectAmount: 40000, deliveryStatus: 'Entregando' },
  ]), 140000);
});

test('a corrected delivery restores its payable amount', () => {
  const order = { toCollectAmount: 70000, deliveryStatus: 'Postergado' };
  assert.equal(lib.settlementOrderAmount(order), 0);
  assert.equal(lib.settlementOrderAmount({ ...order, deliveryStatus: 'Entregado' }), 70000);
});

test('account terms remove only the collectible amount of successful deliveries', () => {
  for (const term of ['Cuenta Corriente', 'Cta. Cte.', 'Cuenta Corriente (30 días)', 'Sin cobro en destino (Cta. Cte.)']) {
    assert.equal(lib.isNoCollectionTerm(term), true);
  }
  for (const term of ['Contado', 'Efectivo / Transferencia', 'No es cuenta corriente']) {
    assert.equal(lib.isNoCollectionTerm(term), false);
  }
  const orders = [
    { orderCode: 'CTA', noCollection: true, routeCollectionAmount: 50000, deliveryStatus: 'Entregado' },
    { orderCode: 'CAJA', routeCollectionAmount: 60000, deliveryStatus: 'Entregado' },
    { orderCode: 'POS', noCollection: true, routeCollectionAmount: 40000, deliveryStatus: 'Postergado' },
  ];
  assert.equal(lib.settlementNoCollectionTotal(orders, 110000), 50000);
  const tickets = [{ orderCode: 'CTA', amount: 10000 }, { orderCode: 'CAJA', amount: 15000 }];
  const electronic = lib.settlementElectronicTicketTotals(tickets, orders);
  assert.equal(electronic.included, 15000);
  assert.equal(electronic.excluded, 10000);
  assert.equal(110000 - lib.settlementNoCollectionTotal(orders, 110000) - electronic.included, 45000);
});
