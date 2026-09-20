const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('la imagen para proveedor expone datos comerciales y omite datos operativos internos', () => {
  const source = fs.readFileSync('src/components/admin/SupplierPurchaseOrderImageModal.tsx', 'utf8');
  assert.match(source, /ORDEN DE COMPRA/);
  assert.match(source, /Copiar imagen/);
  assert.match(source, /Precio unit\./);
  assert.doesNotMatch(source, />Recibido</);
  assert.doesNotMatch(source, />Estado</);
  assert.doesNotMatch(source, /selectedPO\.notes/);
  assert.doesNotMatch(source, /item\.notes/);
});
