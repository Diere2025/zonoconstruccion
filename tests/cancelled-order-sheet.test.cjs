const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cancelledOrderSheet.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, Intl, Date, Math, Number, String });

test('stores month number plus name using the Argentina calendar month', () => {
  const serial = lib.cancellationMonthSerial(new Date('2026-09-24T02:00:00Z'));
  assert.equal(serial, (Date.UTC(2026, 8, 9) - Date.UTC(1899, 11, 30)) / 86400000);
  const october = lib.cancellationMonthSerial(new Date('2026-10-01T03:01:00Z'));
  assert.equal(october, (Date.UTC(2026, 9, 10) - Date.UTC(1899, 11, 30)) / 86400000);
});

test('moves the delivery row three columns right while preserving target formulas', () => {
  const source = ['JS25588', 46289, '', '', 'Cliente', ...Array(11).fill(''), 'Pendiente', 'valor'];
  const sourceFormulas = [...Array(source.length).fill('')];
  sourceFormulas[17] = '=A1';
  const targetFormulas = [...Array(source.length + 3).fill('')];
  targetFormulas[9] = '=formulaExistente';
  const cells = lib.cancelledRowCells(source, sourceFormulas, targetFormulas,
    'JS25588', 'Problemas personales', 46289);
  const byColumn = new Map(cells.map(cell => [cell.columnIndex, cell.value]));

  assert.equal(byColumn.get(0), 'Ventas');
  assert.equal(byColumn.get(1), 'Problemas personales');
  assert.equal(byColumn.get(2), 46289);
  assert.equal(byColumn.get(3), 'JS25588');
  assert.equal(byColumn.get(7), 'Cliente');
  assert.equal(byColumn.get(18), '❌ Anulado');
  assert.equal(byColumn.has(9), false);
  assert.equal(byColumn.has(20), false);
});
