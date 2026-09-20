const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('el asistente trata el límite de unidades como máximo y no como mínimo', () => {
  const source = fs.readFileSync('src/app/admin/compras/page.tsx', 'utf8');
  assert.match(source, /Máximo Unidades \(Opcional\)/);
  assert.match(source, /Máximo configurado:/);
  assert.match(source, /if \(totalIdealUnits > maxUnits\)/);
  assert.doesNotMatch(source, /Mínimo Unidades \(Opcional\)/);
  assert.doesNotMatch(source, /calcMinUnits/);
});
