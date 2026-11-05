const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sellerCommissionBase.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: exported });

test('legacy JS25625 uses discounted products despite freight and stale metadata', () => {
  const order = { total_amount: 1960021, totals: { subtotal: 1605800, freight: 90000, payment_surcharges: 591291, order_discount_amount: 237070 }, order_items: [{ subtotal: 1368730 }] };
  assert.equal(exported.sellerCommissionBase(order).netSales, 1368730);
});

test('current ERP discounts apply proportionally without commission on freight or surcharge', () => {
  const order = { total_amount: 150000, totals: { items_subtotal: 100000, subtotal: 90000, freight: 20000, payment_surcharges: 40000 }, order_items: [{ subtotal: 60000 }, { subtotal: 40000 }] };
  const base = exported.sellerCommissionBase(order);
  assert.equal(base.netSales, 90000);
  assert.equal(base.scaleFactor, 0.9);
  assert.equal(60000 * base.scaleFactor, 54000);
  assert.equal(40000 * base.scaleFactor, 36000);
});

test('fully discounted products and explicit zero subtotals remain zero', () => {
  assert.equal(exported.sellerCommissionBase({ totals: { items_subtotal: 100, subtotal: 0 }, order_items: [{ subtotal: 100 }] }).netSales, 0);
  assert.equal(exported.commissionItemSubtotal({ subtotal: 0, unit_price: 100, quantity: 1 }), 0);
});

test('historical negative discount lines are retained without discounting twice', () => {
  assert.equal(exported.sellerCommissionBase({ order_items: [{ subtotal: 100000 }, { subtotal: -10000 }] }).netSales, 90000);
});

test('a stored subtotal cannot increase the commission base above the product lines', () => {
  const order = { totals: { items_subtotal: 139000, subtotal: 318000 }, order_items: [{ subtotal: 159000 }, { subtotal: -20000 }] };
  assert.equal(exported.sellerCommissionBase(order).netSales, 139000);
  assert.equal(exported.sellerCommissionBase(order).scaleFactor, 1);
});

test('outdated gross subtotal does not replace already discounted or edited items', () => {
  assert.equal(exported.sellerCommissionBase({ totals: { items_subtotal: 495400, subtotal: 495400 }, order_items: [{ subtotal: 485492 }] }).netSales, 485492);
  assert.equal(exported.sellerCommissionBase({ totals: { items_subtotal: 1824000, subtotal: 1724000 }, order_items: [{ subtotal: 1739000 }] }).netSales, 1739000);
});

test('negative discounts are distributed before applying different commission rates', () => {
  const order = {
    totals: { items_subtotal: 90000, subtotal: 100000 },
    order_items: [{ subtotal: 80000 }, { subtotal: 20000 }, { subtotal: -10000 }, { subtotal: 0 }],
  };
  const lines = exported.sellerCommissionLines(order);
  assert.deepEqual(Array.from(lines, line => line.netSales), [72000, 18000, 0]);
  assert.equal(lines[0].netSales * 0.016 + lines[1].netSales * 0.01, 1332);
});

test('line allocation uses the order net once for both total and item discounts', () => {
  const bases = order => Array.from(exported.sellerCommissionLines(order), line => line.netSales);
  assert.deepEqual(bases({ totals: { items_subtotal: 100, subtotal: 90 }, order_items: [{ subtotal: 80 }, { subtotal: 20 }] }), [72, 18]);
  assert.deepEqual(bases({ totals: { items_subtotal: 90, subtotal: 80 }, order_items: [{ subtotal: 80 }, { subtotal: 20 }, { subtotal: -10 }] }), [64, 16]);
  assert.deepEqual(bases({ order_items: [{ subtotal: 100 }, { subtotal: -100 }] }), [0]);
});
