const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const logisticsPrintOrders = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsPrintOrders.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: logisticsPrintOrders, Number, String, Math, Map, Set, Array, RegExp });

const remittances = {};
const transpiled = ts.transpileModule(fs.readFileSync('src/lib/logisticsRemittances.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText.replace('require("@/lib/logisticsPrintOrders")', 'logisticsPrintOrders');
vm.runInNewContext(transpiled, { exports: remittances, logisticsPrintOrders, Number, String, Math, Array, Map, Set, RegExp });

function product(row, slot, name, quantity = 1) {
  const start = 30 + slot * 4;
  row[start] = name;
  row[start + 1] = String(quantity);
}

test('parses remittance fields using the same columns as the source sheet', () => {
  const row = Array(78).fill('');
  row[0] = 'R1';
  row[1] = 'JS25500';
  row[2] = '19/09/2026';
  row[5] = 'Cliente Prueba';
  row[17] = 'Moreno';
  row[18] = 'Calle 123';
  row[30] = 'Tanque 500L';
  row[31] = '2';

  const [parsed] = remittances.parseLogisticsRemittanceRows([row]);
  assert.equal(parsed.remittanceNumber, 516);
  assert.equal(parsed.customerName, 'Cliente Prueba');
  assert.equal(parsed.items[0].quantity, 2);
  assert.equal(remittances.formatLegalRemittanceNumber(parsed.remittanceNumber), 'Nº 00003-00000516');
});

test('skips empty reserved rows and preserves their legal numbering', () => {
  const empty = Array(78).fill('');
  empty[0] = 'R1';
  const populated = Array(78).fill('');
  populated[0] = 'R2';
  populated[5] = 'Segundo cliente';
  populated[30] = 'Producto';
  populated[31] = '1';

  const parsed = remittances.parseLogisticsRemittanceRows([empty, populated]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].remittanceNumber, 517);
});

test('splits twelve products into two consecutively numbered remittances', () => {
  const row = Array(78).fill('');
  row[0] = 'R1';
  row[1] = 'JS100';
  row[5] = 'Cliente Extenso';
  for (let slot = 0; slot < 12; slot++) product(row, slot, `Producto ${slot + 1}`);

  const parsed = remittances.parseLogisticsRemittanceRows([row]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].items.length, 10);
  assert.equal(parsed[1].items.length, 2);
  assert.equal(parsed[0].remittanceNumber, 516);
  assert.equal(parsed[1].remittanceNumber, 517);
  assert.equal(parsed[0].partCount, 2);
});

test('merges linked order codes before distributing seventeen products as ten and seven', () => {
  const first = Array(78).fill('');
  first[0] = 'R1';
  first[1] = 'JS200';
  first[5] = 'Cliente Vinculado';
  first[10] = 'VA CON EL PEDIDO JS201';
  for (let slot = 0; slot < 12; slot++) product(first, slot, `Producto A${slot + 1}`);

  const second = Array(78).fill('');
  second[0] = 'R2';
  second[1] = 'JS201';
  second[5] = 'Cliente Vinculado';
  for (let slot = 0; slot < 5; slot++) product(second, slot, `Producto B${slot + 1}`);

  const parsed = remittances.parseLogisticsRemittanceRows([first, second]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].orderCode, 'JS200 / JS201');
  assert.equal(parsed[0].items.length, 10);
  assert.equal(parsed[1].items.length, 7);
  assert.deepEqual(Array.from(parsed[0].sourceRows), [1, 2]);
});

test('uses ERP-linked legacy codes and moves the following remittance number after overflow', () => {
  const first = Array(78).fill('');
  first[0] = 'R1';
  first[1] = 'JS300';
  first[5] = 'Cliente ERP';
  for (let slot = 0; slot < 12; slot++) product(first, slot, `Producto ${slot + 1}`);

  const sibling = Array(78).fill('');
  sibling[0] = 'R2';
  sibling[1] = 'JS301';
  sibling[5] = 'Cliente ERP';
  product(sibling, 0, 'Producto 13');

  const following = Array(78).fill('');
  following[0] = 'R3';
  following[1] = 'JS400';
  following[5] = 'Otro cliente';
  product(following, 0, 'Producto siguiente');

  const parsed = remittances.parseLogisticsRemittanceRows(
    [first, sibling, following],
    1,
    ['JS300 / JS301']
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].items.length, 10);
  assert.equal(parsed[1].items.length, 3);
  assert.equal(parsed[2].orderCode, 'JS400');
  assert.equal(parsed[2].remittanceNumber, 518);
});
