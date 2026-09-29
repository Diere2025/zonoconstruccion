const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

function evaluate(file, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, { exports, require: name => imports[name] || require(name), ...globals });
  return exports;
}
const scope = evaluate('src/lib/dashboardScope.ts', {});
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const source = fs.readFileSync('src/app/admin/dashboard/page.tsx', 'utf8');
const names = [...source.matchAll(/const \[(\w+),[^\]]*\]\s*=\s*useState/g)].map(match => match[1]);

async function dashboard(channel) {
  let cursor = 0;
  const state = new Map();
  const effects = [];
  const overrides = { selectedChannel: channel };
  const hooks = { ...React, useState: initial => {
    const name = names[cursor++];
    state.set(name, name in overrides ? overrides[name] : typeof initial === 'function' ? initial() : initial);
    return [state.get(name), next => state.set(name, typeof next === 'function' ? next(state.get(name)) : next)];
  }, useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) };
  const orders = [
    { id: 'a', legacy_code: 'SHARED', seller_id: 's1', channel: 'minorista', status: 'Entregado', total_amount: 100 },
    { id: 'b', legacy_code: 'SHARED', seller_id: 's1', channel: 'mayorista', status: 'Confirmado', total_amount: 200 },
    { id: 'c', legacy_code: 'RETAIL', seller_id: 's2', channel: 'web_organica', status: 'Anulado', total_amount: 90 },
    { id: 'd', legacy_code: 'UNKNOWN', seller_id: 's2', channel: null, status: 'Pendiente', total_amount: 50 }
  ].map(order => ({ ...order, order_date: date, created_at: `${date}T12:00:00`, customer_name: order.id, locality: 'Buenos Aires' }));
  // A true duplicate must contribute neither order billing nor product billing twice.
  orders.push({ ...orders[0], id: 'e' });
  const oldOrder = { ...orders[1], id: 'old', legacy_code: 'OLD', order_date: '2020-01-01', total_amount: 70, status: 'Entregado' };
  const tables = {
    orders: [...orders, oldOrder], clients: [{ id: 'client' }], products: [{ id: 'product' }],
    sellers: [{ id: 's1', full_name: 'Uno' }, { id: 's2', full_name: 'Dos' }],
    order_items: orders.map(order => ({ id: `item-${order.id}`, product_name: `Producto ${order.channel || 'sin canal'}`, quantity: 1, unit_price: order.total_amount, products: { sku: 'P', category: 'Otros' }, orders: order })),
    deliveries: [orders[0], oldOrder].map(order => ({ id: `delivery-${order.id}`, order_id: order.id, real_delivery_date: date, status: 'entregado', orders: order }))
  };
  const queries = [];
  const field = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
  const supabase = { from: table => {
    const filters = [];
    let limit = Infinity, start = 0, end = Infinity, counting = false, sortField, signal;
    const query = {
      select(_projection, options) { counting = options?.head; return query; },
      eq(key, value) { filters.push(row => field(row, key) === value); return query; },
      gte(key, value) { filters.push(row => field(row, key) >= value); return query; },
      lte(key, value) { filters.push(row => field(row, key) <= value); return query; },
      in(key, values) { filters.push(row => values.includes(field(row, key))); return query; },
      or() { filters.push(row => scope.classifyDashboardChannel(row.channel) === 'unclassified'); return query; },
      not(key) { filters.push(row => !['Cancelado', 'Anulado'].includes(field(row, key))); return query; },
      order(key) { sortField = key; return query; },
      limit(value) { limit = value; return query; },
      abortSignal(value) { signal = value; return query; },
      range(from, to) { start = from; end = to; return query; },
      then(resolve, reject) {
        queries.push({ table, start, end });
        if (signal?.aborted) return Promise.reject(Error('Aborted')).then(resolve, reject);
        let data = tables[table].filter(row => filters.every(filter => filter(row)));
        if (sortField) data = data.slice().sort((a, b) => String(a[sortField]).localeCompare(String(b[sortField])));
        return Promise.resolve({ data: counting ? null : data.slice(start, Math.min(end + 1, start + limit)), count: data.length, error: null }).then(resolve, reject);
      }
    };
    return query;
  } };
  const charts = Object.fromEntries(['CategorySalesChart', 'OrderStatusChart', 'SalesTrendChart', 'WeeklyComparisonChart'].map(name => [`@/components/dashboard/${name}`, { default: () => null }]));
  const app = evaluate('src/app/admin/dashboard/page.tsx', {
    react: hooks, '@/lib/dashboardScope': scope, '@/lib/supabase': { supabase }, '@/lib/utils': { formatPrice: String },
    '@/components/ui/Badge': { OrderStatusBadge: () => null }, ...charts
  }, { AbortController, window: { setTimeout, clearTimeout }, console: { error: (...args) => { throw Error(args[1]); }, warn() {} },
    fetch: async () => ({ ok: true, json: async () => ({ success: true, totalUnimportedCount: 1, unimportedOrders: [{ totalAmount: 999 }] }) })
  });
  app.default();
  const cleanup = effects.find(fn => fn.toString().includes('loadData'))();
  for (let round = 0; round < 80; round++) await Promise.resolve();
  assert.equal(state.get('loading'), false);
  assert.equal(state.get('loadError'), '');
  cleanup();
  return { state, queries };
}

test('general dashboard reconciles KPIs, products, channel totals and delivery dates', async () => {
  const { state, queries } = await dashboard('all');
  assert.equal(state.get('stats').monthlySales, 350);
  assert.equal(state.get('stats').totalOrdersCount, 4);
  assert.equal(state.get('todayStats').sales, 350);
  assert.equal(state.get('monthStats').sales, 350);
  assert.equal(state.get('productsSold').reduce((sum, product) => sum + product.total, 0), 350);
  assert.equal(Object.values(state.get('channelSummary')).reduce((sum, group) => sum + group.sales, 0), 350);
  assert.equal(state.get('unimportedSellerData').totalAmount, 999);
  assert.equal(state.get('dailyTrendData').reduce((sum, day) => sum + day.deliveredSales, 0), 170);
  assert.ok(queries.filter(query => ['orders', 'order_items', 'deliveries'].includes(query.table)).some(query => query.end === 499));
});

test('every channel applies to current, fixed, product, recent and delivery blocks', async () => {
  for (const [channel, sales, count, delivered] of [['minorista', 100, 2, 100], ['mayorista', 200, 1, 70], ['unclassified', 50, 1, 0]]) {
    const { state } = await dashboard(channel);
    assert.equal(state.get('stats').monthlySales, sales, channel);
    assert.equal(state.get('stats').totalOrdersCount, count, channel);
    assert.equal(state.get('todayStats').sales, sales, channel);
    assert.equal(state.get('monthStats').sales, sales, channel);
    assert.equal(state.get('productsSold').reduce((sum, product) => sum + product.total, 0), sales, channel);
    assert.ok(state.get('recentOrders').every(order => scope.matchesDashboardChannel(order, channel)), channel);
    assert.equal(state.get('dailyTrendData').reduce((sum, day) => sum + day.deliveredSales, 0), delivered, channel);
  }
});
