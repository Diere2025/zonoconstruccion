const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(name, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require: name => dependencies[name] });
  return exports;
}
const print = load('logisticsPrintOrders');
const plans = load('cuotaSimple');
const notes = load('logisticsOrderNotes', { './logisticsPrintOrders': print, './cuotaSimple': plans });

function row(code, date = '24/09/2026', driver = 'Chofer A', route = 'R1') {
  const values = Array(84).fill('');
  values[1] = code;
  values[2] = date;
  values[13] = 'Matanza';
  values[14] = route;
  values[78] = 'Fletero A';
  values[80] = driver;
  values[81] = 'SAVEIRO';
  values[82] = 'Acompañante A';
  values[83] = '7:20';
  return values;
}

test('current installment names and retired methods are recognized', () => {
  for (const [index, plan] of plans.CUOTA_SIMPLE_PLANS.entries()) {
    assert.equal(plans.cuotaSimpleInstallments(plan.name), [2, 3, 6][index]);
    assert.equal(plans.isRetiredPaymentMethod(plan.name), false);
    assert.equal(notes.selectedOrderNoteCardIndex(plan.name), index);
  }
  for (const name of ['Payway6 (Sept-26)', 'Cuota Simple (Sept-26)', 'Cuota Simple (Mayo-26)']) {
    assert.equal(plans.isRetiredPaymentMethod(name), true);
    assert.equal(notes.selectedOrderNoteCardIndex(name), null);
  }
  assert.equal(plans.isRetiredPaymentMethod('Contado'), false);
});

test('cash and each preselected plan share a base without compounding surcharges', () => {
  const base = { ...print.parseLogisticsPrintRows([row('JS1')])[0], productsSubtotal: 100000, pendingBalance: 100000 };
  const expected = [122000, 128000, 145500];
  assert.deepEqual(Array.from(notes.orderNoteCardAmounts(base, notes.DEFAULT_ORDER_NOTE_RATES)), expected);
  for (const [index, plan] of plans.CUOTA_SIMPLE_PLANS.entries()) {
    for (const surcharge of [0, expected[index] - 100000]) {
      const order = { ...base, paymentMethod: plan.name, pendingBalance: expected[index], surcharge };
      assert.equal(notes.orderNoteBaseAmount(order, notes.DEFAULT_ORDER_NOTE_RATES), 100000);
      assert.deepEqual(Array.from(notes.orderNoteCardAmounts(order, notes.DEFAULT_ORDER_NOTE_RATES)), expected);
    }
  }
});

test('a saved custom total is preserved in its selected installment column', () => {
  const order = { ...print.parseLogisticsPrintRows([row('JS1')])[0], paymentMethod: 'Cuota Simple x3 (oct26)', productsSubtotal: 100000, surcharge: 25000, pendingBalance: 125000 };
  assert.deepEqual(Array.from(notes.orderNoteCardAmounts(order, notes.DEFAULT_ORDER_NOTE_RATES)), [122000, 125000, 145500]);
});

test('historical Payway and inflated legacy Cuota Simple recover their base', () => {
  const base = { ...print.parseLogisticsPrintRows([row('JS1')])[0], productsSubtotal: 100000 };
  const payway = { ...base, paymentMethod: 'Payway6 (Sept-26)', pendingBalance: 143200, surcharge: 43200 };
  assert.equal(notes.orderNoteBaseAmount(payway, notes.DEFAULT_ORDER_NOTE_RATES), 100000);
  assert.equal(notes.orderNoteBaseAmount({ ...payway, surcharge: 0 }, notes.DEFAULT_ORDER_NOTE_RATES), 100000);
  const legacy = { ...base, paymentMethod: 'Cuota Simple (Sept-26)', productsSubtotal: 142000, surcharge: 59640, pendingBalance: 201640 };
  assert.equal(notes.orderNoteBaseAmount(legacy, notes.DEFAULT_ORDER_NOTE_RATES), 100000);
  assert.deepEqual(Array.from(notes.orderNoteCardAmounts(legacy, notes.DEFAULT_ORDER_NOTE_RATES)), [122000, 128000, 145500]);
});

test('fully paid orders never show an amount to collect', () => {
  const order = { ...print.parseLogisticsPrintRows([row('JS1')])[0], paymentMethod: 'Cuota Simple x6 (oct26)', surcharge: 45500, productsSubtotal: 100000, pendingBalance: 0 };
  assert.deepEqual(Array.from(notes.orderNoteCardAmounts(order, notes.DEFAULT_ORDER_NOTE_RATES)), [0, 0, 0]);
});

test('equivalent dates and trip formatting stay on the same sheet', () => {
  const rows = [row('JS1'), row('JS2', '2026-09-24', ' chofer  a ')];
  rows[1][83] = '07:20';
  const pages = notes.buildOrderNotePages(print.parseLogisticsPrintRows(rows));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].orders.length, 2);
  assert.equal(pages[0].trip.driver, 'Chofer A');
});

test('delivery date and transport details create separate groups, but ruteador, zones and routes do not', () => {
  for (const column of [2, 80, 81, 82, 83]) {
    const values = row('JS2');
    values[column] = column === 2 ? '25/09/2026' : 'Otro valor';
    const orders = print.parseLogisticsPrintRows([row('JS1'), values]);
    assert.equal(notes.buildOrderNoteGroups(orders).length, 2, `column ${column}`);
    assert.equal(notes.buildOrderNotePages(orders).length, 2, `column ${column}`);
  }
  for (const column of [13, 14, 78]) {
    const values = row('JS2');
    values[column] = 'Otra zona o recorrido';
    const orders = print.parseLogisticsPrintRows([row('JS1'), values]);
    assert.equal(notes.buildOrderNoteGroups(orders).length, 1, `column ${column}`);
    assert.equal(notes.buildOrderNotePages(orders).length, 1, `column ${column}`);
  }
});

test('repeated trips are grouped in first appearance order and retain their own driver', () => {
  const orders = print.parseLogisticsPrintRows([row('JS1'), row('JS2', '24/09/2026', 'Chofer B'), row('JS3')]);
  const groups = notes.buildOrderNoteGroups(orders);
  assert.deepEqual(Array.from(groups[0].orders, order => order.id), ['JS1', 'JS3']);
  assert.equal(groups[1].trip.driver, 'Chofer B');
  assert.equal(groups[1].orders[0].id, 'JS2');
});

test('capacity pagination does not create a false different-trip warning', () => {
  const orders = print.parseLogisticsPrintRows(Array.from({ length: 19 }, (_, i) => row(`JS${i}`)));
  assert.equal(notes.buildOrderNoteGroups(orders).length, 1);
  const pages = notes.buildOrderNotePages(orders);
  assert.deepEqual(Array.from(pages, page => page.orders.length), [18, 1]);
  assert.equal(pages[1].firstRowNumber, 19);
});

test('manual defaults only fill missing trip fields', () => {
  const values = row('JS1');
  values[82] = '';
  const [page] = notes.buildOrderNotePages(print.parseLogisticsPrintRows([values]), { driver: 'Otro chofer', companion: 'Acompañante manual' });
  assert.equal(page.trip.driver, 'Chofer A');
  assert.equal(page.trip.companion, 'Acompañante manual');
});

test('linked orders in different trips are not merged under the first driver', () => {
  const a = row('JS1');
  a[10] = 'VA CON EL PEDIDO JS2';
  const b = row('JS2', '24/09/2026', 'Chofer B');
  const orders = print.mergeLogisticsPrintOrders(print.parseLogisticsPrintRows([a, b]));
  assert.equal(orders.length, 2);
  assert.equal(notes.buildOrderNoteGroups(orders).length, 2);
});

test('linked orders across zones remain one trip and list both routes', () => {
  const a = row('JS1');
  a[10] = 'VA CON EL PEDIDO JS2';
  const b = row('JS2');
  b[13] = 'CABA';
  b[14] = 'R2';
  const orders = print.mergeLogisticsPrintOrders(print.parseLogisticsPrintRows([a, b]));
  assert.equal(orders.length, 1);
  assert.equal(notes.buildOrderNoteGroups(orders).length, 1);
});

test('a repeated code in different trips has separate selectable identifiers', () => {
  const orders = print.mergeLogisticsPrintOrders(print.parseLogisticsPrintRows([row('JS1'), row('JS1', '25/09/2026')]));
  assert.equal(orders.length, 2);
  assert.notEqual(orders[0].id, orders[1].id);
});
