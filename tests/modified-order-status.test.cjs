const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('editar conserva Pendiente en ERP y Modificado solo en el payload de planilla', () => {
  const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
  const occurrences = [...source.matchAll(/status: 'Modificado'/g)];
  assert.equal(occurrences.length, 1);
  const sheetStart = source.lastIndexOf('const sheetOrderPayload', occurrences[0].index);
  assert.ok(sheetStart > 0);
  assert.ok(occurrences[0].index - sheetStart < 3000);
  assert.match(source, /originalOrderSnapshot\?\.status === 'Modificado'/);
  assert.match(source, /status: orderData\.status/);
  assert.doesNotMatch(source, /p\.status === 'Modificado'/);
});
