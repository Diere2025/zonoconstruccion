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
const notes = load('logisticsOrderNotes', { './logisticsPrintOrders': print });

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

test('equivalent dates and trip formatting stay on the same sheet', () => {
  const rows = [row('JS1'), row('JS2', '2026-09-24', ' chofer  a ')];
  rows[1][83] = '07:20';
  const pages = notes.buildOrderNotePages(print.parseLogisticsPrintRows(rows));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].orders.length, 2);
  assert.equal(pages[0].trip.driver, 'Chofer A');
});

test('every distinguishing trip field and delivery date creates a separate group', () => {
  for (const column of [2, 13, 14, 78, 80, 81, 82, 83]) {
    const values = row('JS2');
    values[column] = column === 2 ? '25/09/2026' : 'Otro valor';
    const orders = print.parseLogisticsPrintRows([row('JS1'), values]);
    assert.equal(notes.buildOrderNoteGroups(orders).length, 2, `column ${column}`);
    assert.equal(notes.buildOrderNotePages(orders).length, 2, `column ${column}`);
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

test('a repeated code in different trips has separate selectable identifiers', () => {
  const orders = print.mergeLogisticsPrintOrders(print.parseLogisticsPrintRows([row('JS1'), row('JS1', '25/09/2026')]));
  assert.equal(orders.length, 2);
  assert.notEqual(orders[0].id, orders[1].id);
});
