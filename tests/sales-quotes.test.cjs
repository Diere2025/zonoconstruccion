const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('database/db_migration_v80_sales_quotes.sql', 'utf8');
const orders = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const wholesale = fs.readFileSync('src/app/vendedores/presupuestos-mayorista/page.tsx', 'utf8');
const retail = fs.readFileSync('src/app/vendedores/presupuestos/page.tsx', 'utf8');
const board = fs.readFileSync('src/app/vendedores/cotizaciones/page.tsx', 'utf8');

test('quotes are separate from orders and have a linked conversion path', () => {
  assert.match(migration, /create table if not exists public\.sales_quotes/);
  assert.match(migration, /create table if not exists public\.sales_quote_items/);
  assert.match(migration, /create table if not exists public\.sales_quote_followups/);
  assert.match(migration, /add column if not exists quote_id uuid references public\.sales_quotes/);
  assert.match(migration, /'converted'/);
});

test('quotes do not trigger logistics until the normal order form is saved', () => {
  assert.doesNotMatch(wholesale, /\.from\("orders"\)\s*\.insert/);
  assert.match(wholesale, /router\.push\('\/vendedores\/pedidos\?tab=form&client_type=mayoristas'\)/);
  assert.match(orders, /quote_id: sourceQuoteId/);
  assert.match(orders, /status: 'converted', converted_order_id: orderData\.id/);
});

test('both sales channels persist quotes and expose follow-up management', () => {
  assert.match(retail, /saveSalesQuote\(buildMinoristaQuote/);
  assert.match(wholesale, /saveSalesQuote\(buildWholesaleQuote/);
  assert.match(board, /sales_quote_followups/);
  assert.match(board, /Presupuestos y Seguimiento/);
  assert.match(board, /Convertir/);
});
