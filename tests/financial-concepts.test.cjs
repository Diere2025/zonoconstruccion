const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/financialConcepts.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });

const { parseFinancialConceptRows, financialConceptKey } = moduleExports;
const rows = [
  ['Concepto', 'Categoría (Sería Sub Categoría)', 'Cuenta (Sería Categoría)', 'Tipo Mov. ', 'EFE'],
  ['Albañilería', 'Albañilería', 'Gastos Operativos', 'Egreso', 'Repuestos/Mantenimiento Instalaciones'],
  ['Ingreso de dinero', 'Venta - MercadoPago', 'Recaudación', 'Ingreso', 'Ventas Minoristas'],
  ['Sin clasificación', '', '', 'Egreso', ''],
  ['Sin tipo', '', 'Otro', 'Desconocido', '']
];
const parsed = parseFinancialConceptRows(rows);
assert.equal(parsed.items.length, 2);
assert.equal(parsed.items[0].sub_category, 'Albañilería');
assert.equal(parsed.items[0].category, 'Gastos Operativos');
assert.equal(parsed.items[1].efe_category, 'Ventas Minoristas');
assert.deepEqual(Array.from(parsed.invalidRows), [4, 5]);
assert.equal(financialConceptKey(parsed.items[0]), financialConceptKey({ ...parsed.items[0], concept: 'ALBANILERIA' }));
assert.notEqual(financialConceptKey(parsed.items[0]), financialConceptKey({ ...parsed.items[0], category: 'Otro' }));
console.log('financial concepts parser: ok');
