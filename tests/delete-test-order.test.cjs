const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('src/app/api/vendedores/delete-order/route.ts', 'utf8');
const sheets = fs.readFileSync('src/lib/googleSheets.ts', 'utf8');
const page = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const worker = fs.readFileSync('src/app/api/vendedores/order-sync-worker/route.ts', 'utf8');

test('test-order deletion is protected by server-side admin authentication and exact-code confirmation', () => {
  assert.match(api, /auth\.getUser\(token\)/);
  assert.match(api, /seller\?\.role === 'admin'/);
  assert.match(api, /confirmationCode !== legacyCode/);
  assert.match(page, /Authorization': `Bearer \$\{session\.access_token\}`/);
  assert.match(page, /Escribí \$\{code\} para confirmar/);
});

test('test-order deletion clears every integration while preserving the customer', () => {
  assert.match(api, /removeTestOrderFromSheets\(order\.seller_id, legacyCode\)/);
  assert.match(api, /deleteTelegramMessages\(totalsWithJobNotifications\)/);
  assert.match(api, /deleteRows\('inventory_transactions'/);
  assert.match(api, /deleteRows\('order_items'/);
  assert.match(api, /deleteRows\('deliveries'/);
  assert.doesNotMatch(api, /from\('clients'\)\.delete/);
});

test('sheet rollback keeps the seller code slot and frees operational rows without touching formulas', () => {
  assert.match(sheets, /preserveCode: true, clearSellerStatus: true/);
  assert.match(sheets, /CENTRAL_ORDERS_SHEET/);
  assert.match(sheets, /DELIVERIES_CURRENT_SHEET\.sheetNames/);
  assert.match(sheets, /values:batchClear/);
  assert.doesNotMatch(sheets, /makeRange\(sheetName, 'Z', 'Z', rowNumber, columnOffset\)/);
});

test('new operational and receipt Telegram message ids are persisted for later rollback', () => {
  assert.match(worker, /telegram_notifications/);
  assert.match(worker, /telegram_message_id: messageId/);
  assert.match(worker, /telegram_chat_id: receiptResult\.chatId/);
});
