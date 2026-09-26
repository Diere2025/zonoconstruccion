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
