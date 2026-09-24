const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsPaste.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, String, Array, RegExp });

test('keeps a quoted multiline Google Sheets cell inside one order row', () => {
  const cells = ['CAMB1478', '6/08/2026', '', '', 'Sergio Daniel Cejas'];
  while (cells.length < 30) cells.push('');
  cells.push('BioFort - Biodigestor 600L', '1', '274.900', '274.900');
  const text = cells.map((cell, index) => index === 9 ? '"línea uno\nlínea dos"' : cell).join('\t');

  const rows = lib.parseLogisticsClipboardText(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 78);
  assert.equal(rows[0][1], 'CAMB1478');
  assert.equal(rows[0][10], 'línea uno línea dos');
});

test('discards loose multiline fragments and columns after BZ', () => {
  const main = ['CAMB1478', '6/08/2026', '', '', '', 'Cliente'].concat(Array(90).fill('extra')).join('\t');
  const looseLines = '\ntexto interno sin código\n*PRESUPUESTO*\tcontenido';
  const rows = lib.parseLogisticsClipboardText(main + looseLines);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 78);
  assert.equal(rows[0][1], 'CAMB1478');
});

test('keeps the first delivery even when message columns mention Código Pedido and Cliente', () => {
  const cells = Array(95).fill('');
  cells[0] = 'JS25561';
  cells[1] = '24/09/2026';
  cells[8] = 'Orgánico / Cliente Habitual / Recomendado';
  cells[88] = '*Código Pedido: JS25561*';
  const rows = lib.normalizeLogisticsPastedRows([cells]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], 'JS25561');
});

test('distinguishes literal inch marks from quoted multiline cells without losing later orders', () => {
  const cells = Array(95).fill('');
  cells[0] = 'JS25561';
  cells[1] = '24/09/2026';
  cells[29] = 'Flotante Eco Varilla Plástica 1/2"';
  cells[30] = '1';
  cells[31] = '10.000';
  cells[85] = '"1 Flotante 1/2""\r\nOtro producto"';
  const next = [...cells];
  next[0] = 'JS25577';
  const parsed = lib.parseLogisticsClipboardText(cells.join('\t') + '\r\n' + next.join('\t'));
  assert.deepEqual(Array.from(parsed, row => row[1]), ['JS25561', 'JS25577']);
  assert.equal(parsed[0][30], 'Flotante Eco Varilla Plástica 1/2"');
  assert.equal(parsed[0][32], '10.000');
});

test('keeps trip metadata per order when requested but discards message columns', () => {
  const row = Array(95).fill('');
  row[0] = 'JS25561';
  row[1] = '24/09/2026';
  row[77] = 'Fletero A';
  row[79] = 'Chofer A';
  row[80] = 'SAVEIRO';
  row[81] = 'Acompañante A';
  row[82] = '7:20';
  row[85] = 'Mensaje que no se importa';
  const [parsed] = lib.normalizeLogisticsPastedRows([row], true);
  assert.equal(parsed.length, 84);
  assert.equal(parsed[78], 'Fletero A');
  assert.equal(parsed[80], 'Chofer A');
  assert.equal(parsed[83], '7:20');
});

test('skips real header cells and supports an existing leading sheet-label column', () => {
  const rows = lib.normalizeLogisticsPastedRows([
    ['', 'Código', 'Entrega', '', '', 'Cliente'],
    ['R1', 'JS25561', '24/09/2026', '', '', 'Cliente']
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'R1');
  assert.equal(rows[0][1], 'JS25561');
});
