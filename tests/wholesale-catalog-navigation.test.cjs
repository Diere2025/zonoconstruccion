const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Pedidos Mayoristas always navigates back to the list tab', () => {
  const layout = fs.readFileSync('src/components/ui/AdminLayout.tsx', 'utf8');
  const orders = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');

  assert.match(layout, /Pedidos Mayoristas[^\n]+tab=list&list_type=todos/);
  assert.match(orders, /if \(urlTab === 'form' \|\| urlTab === 'nuevo'\)[\s\S]+?else \{\s*setActiveTab\('list'\)/);
});

test('Lista 12 exposes wholesale floats, bases and automatic controls', () => {
  const route = fs.readFileSync('src/app/api/admin/lista-mayorista-data/route.ts', 'utf8');

  for (const category of ["'Flotantes'", "'Bases'", "'Automáticos'"]) {
    assert.match(route, new RegExp(category));
  }
  for (const product of [
    'Flotante Eco Varilla Plástica 1/2"',
    'Flotante Completo Varilla Bronce Rao 1/2',
    'Base Hierro Reforzada 74 cms',
    'Base Hierro Reforzada 145 cms',
    'AUTOMATICO TANQUE/CISTERNA - MP (1,5m)'
  ]) {
    assert.ok(route.includes(product), `missing wholesale accessory: ${product}`);
  }
});
