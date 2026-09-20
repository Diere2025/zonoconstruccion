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
