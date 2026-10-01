const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const page = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const fetchEffect = page.slice(page.indexOf('  // Fetch orders list'), page.indexOf('  // Fetch recent orders for'));
const displayFilter = page.slice(page.indexOf('  const filteredOrders = sortedOrders.filter'), page.indexOf('  const matchingExistingClient'));
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function search({ term = 'js25810', role = 'admin', accessible = ['other', 'self'], failure = false, productFilter = true } = {}) {
  const records = [
    { id: 'old', legacy_code: 'JS25810', seller_id: 'other', order_date: '2024-01-01', status: 'Entregado', channel: 'mayorista' },
    { id: 'own', legacy_code: 'DB0666', seller_id: 'self', order_date: '2026-10-01', status: 'Pendiente', channel: 'minorista' },
  ];
  const calls = [];
  let orders = [];
  let error;
  const context = {
    activeTab: 'list', listType: 'mis_pedidos', role, currentUserId: 'self', sellerFilter: 'self',
    debouncedOrderSearch: term, selectedStatuses: ['Pendientes'], selectedChannels: ['minoristas'],
    selectedProducts: productFilter ? ['tank'] : [], expandedSelectedProductIds: new Set(['tank']), products: [],
    dateFrom: '2026-10-01', dateTo: '2026-10-01', refreshTrigger: 0,
    setLoadingOrders() {}, setOrdersError(value) { error = value; }, setOrders(value) { orders = value; },
    console: { error() {} },
    useEffect(effect) { effect(); },
    isOrderWholesale: order => order.channel === 'mayorista',
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'self' } } } }) },
      from() {
        const queryCalls = [];
        calls.push(queryCalls);
        let result = records.filter(order => accessible.includes(order.seller_id));
        const query = {};
        for (const method of ['select', 'order', 'in', 'eq', 'neq', 'or', 'gte', 'lte', 'limit', 'ilike']) {
          query[method] = (...args) => {
            queryCalls.push([method, ...args]);
            const [field, value] = args;
            if (method === 'select' && field.includes('!inner')) result = [];
            if (method === 'in') result = result.filter(order => value.includes(order[field]));
            if (method === 'eq') result = result.filter(order => order[field] === value);
            if (method === 'neq') result = result.filter(order => order[field] !== value);
            if (method === 'gte') result = result.filter(order => order[field] >= value);
            if (method === 'lte') result = result.filter(order => order[field] <= value);
            if (method === 'ilike') result = result.filter(order => order[field].toLowerCase().includes(term.toLowerCase()));
            return query;
          };
        }
        query.then = (resolve, reject) => {
          return Promise.resolve({ data: result, error: failure && queryCalls.some(call => call[0] === 'ilike') ? { message: 'lookup failed' } : null }).then(resolve, reject);
        };
        return query;
      },
    },
  };
  vm.runInNewContext(compile(fetchEffect), context);
  // Let session loading, the parallel queries and their continuations complete.
  await new Promise(resolve => setImmediate(resolve));
  context.sortedOrders = orders;
  vm.runInNewContext(compile(`${displayFilter}\nglobalThis.visible = filteredOrders;`), context);
  return { orders, visible: context.visible, calls, error };
}

test('code lookup finds old orders despite status, channel, product, seller, date and My Orders filters', async () => {
  const result = await search();
  assert.deepEqual(Array.from(result.visible, order => order.id), ['old']);
  const codeCalls = result.calls[1];
  assert.ok(codeCalls.some(call => call[0] === 'ilike' && call[1] === 'legacy_code'));
  assert.ok(!codeCalls.some(call => ['eq', 'neq', 'in', 'gte', 'lte', 'or'].includes(call[0])));
  assert.ok(!codeCalls.some(call => call[0] === 'select' && call[1].includes('!inner')));
});

test('code lookup cannot return orders denied by authenticated database permissions', async () => {
  const result = await search({ role: 'seller', accessible: ['self'] });
  assert.equal(result.visible.length, 0);
});

test('clearing search restores the current filters without a global lookup', async () => {
  const result = await search({ term: '' });
  assert.equal(result.calls.length, 1);
  assert.equal(result.visible.length, 0);
});

test('an order present in both queries is shown only once', async () => {
  const result = await search({ term: 'db0666', productFilter: false });
  assert.deepEqual(Array.from(result.visible, order => order.id), ['own']);
});

test('failed code lookup reports an error instead of presenting an incomplete search', async () => {
  const result = await search({ failure: true });
  assert.equal(result.error, 'lookup failed');
});
