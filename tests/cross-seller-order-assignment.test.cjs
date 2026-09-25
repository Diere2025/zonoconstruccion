const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const orderPage = fs.readFileSync(
  path.join(root, 'src/app/vendedores/pedidos/page.tsx'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(root, 'database/db_migration_v81_cross_seller_order_assignment.sql'),
  'utf8',
);
const assignedOrderRoute = fs.readFileSync(
  path.join(root, 'src/app/api/vendedores/create-assigned-order/route.ts'),
  'utf8',
);

test('the selected seller owns the sale while the logged-in user remains the loader', () => {
  assert.match(orderPage, /const seller_id = selectedSellerId \|\| loggedInUserId/);
  assert.match(orderPage, /seller_id,\s+created_by_id: loggedInUserId,/);
  assert.match(orderPage, /sellerName: sellersList\.find\(seller => seller\.id === seller_id\)/);
});

test('only admins can reassign an existing order and its legacy code stays in the original sheet', () => {
  assert.match(orderPage, /\.\.\.\(role === 'admin' \? \{ seller_id \} : \{\}\)/);
  assert.match(orderPage, /disabled=\{Boolean\(editingOrderId\) && role !== 'admin'\}/);
  assert.match(orderPage, /sellerId: originalOrderSnapshot\?\.seller_id \|\| seller_id/);
});

test('cross-seller creation uses an authenticated server endpoint without broadening RLS', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS created_by_id uuid/);
  assert.doesNotMatch(migration, /CREATE POLICY|DROP POLICY/);
  assert.match(orderPage, /fetch\('\/api\/vendedores\/create-assigned-order'/);
  assert.match(orderPage, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(assignedOrderRoute, /supabaseAdmin\.auth\.getUser\(token\)/);
  assert.match(assignedOrderRoute, /canLoadOrders\(loader\)/);
  assert.match(assignedOrderRoute, /canLoadOrders\(assignedSeller\)/);
  assert.match(assignedOrderRoute, /created_by_id: authData\.user\.id/);
  assert.match(assignedOrderRoute, /supabaseAdmin\.from\('order_items'\)\.insert\(safeItems\)/);
});
