const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
let formatter;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleLoadOrderIntoForm') handler = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'formatOrderForPrintable') formatter = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
// Exercise the actual opening guards, stopping before loading the form's data.
const statements = handler.body.statements;
const firstWrite = statements.findIndex(node => node.getText(ast) === 'isEditingRef.current = true;');
assert.ok(firstWrite > 0);
const opening = ts.transpileModule(`(async (order, isClone = false) => {
  ${statements.slice(0, firstWrite).map(node => node.getText(ast)).join('\n')}
  captureOrder(order);
  return 'allowed';
})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function check({ currentUserId = '', userId = 'jazmin', role = 'seller', sellerId = 'jazmin', error = null, throws = false, isClone = false, input, stored, readError = null, readThrows = false } = {}) {
  const state = { notice: '', userId: currentUserId, reads: 0 };
  const record = stored === undefined ? { id: 'order-1', seller_id: sellerId, status: 'Pendiente' } : stored;
  const open = vm.runInNewContext(opening, {
    currentUserId, role,
    captureOrder: order => { state.loadedOrder = order; },
    supabase: { auth: { getUser: async () => {
      if (throws) throw new Error('Network failure');
      return { data: { user: userId ? { id: userId } : null }, error };
    } }, from: table => {
      assert.equal(table, 'orders');
      state.reads++;
      return { select: columns => {
        assert.equal(columns, '*');
        return { eq: (column, id) => {
          assert.equal(column, 'id');
          assert.equal(id, 'order-1');
          return { maybeSingle: async () => {
            if (readThrows) throw new Error('Network failure');
            return { data: record, error: readError };
          } };
        } };
      } };
    } },
    setCurrentUserId: id => { state.userId = id; },
    setOrderSaveNotice: notice => { state.notice = notice; },
  });
  state.result = await open(input || { id: 'order-1', seller_id: sellerId, status: 'Pendiente' }, isClone);
  return state;
}

test('Jazmín opens her pending order before initialization or with stale component state', async () => {
  for (const currentUserId of ['', 'previous-account']) {
    const state = await check({ currentUserId });
    assert.equal(state.result, 'allowed');
    assert.equal(state.userId, 'jazmin');
    assert.equal(state.notice, '');
  }
});

test('the current account cannot edit or copy another seller order despite stale matching state', async () => {
  for (const isClone of [false, true]) {
    const state = await check({ userId: 'other', currentUserId: 'jazmin', isClone });
    assert.equal(state.result, undefined);
    assert.match(state.notice, /asignados a tu usuario/);
  }
});

test('missing sessions and verification failures stop before loading order data', async () => {
  for (const args of [{ userId: null }, { error: { status: 503 } }, { throws: true }]) {
    const state = await check(args);
    assert.equal(state.result, undefined);
    assert.match(state.notice, /verificar tu sesión/);
    assert.equal(state.reads, 0);
  }
});

test('editing from detail or print reloads the complete order instead of using the printable summary', async () => {
  const stored = { id: 'order-1', seller_id: 'jazmin', client_id: 'client-1', status: 'Pendiente', payment_method_id: 'payment-1', totals: { freight: 7000, subtotal: 490000, order_discount_amount: 12250, customer_snapshot: { phone_primary: '111' } }, order_items: [{ product_name: 'Termotanque', sku: 'TT', quantity: 1, unit_price: 490000 }] };
  const format = vm.runInNewContext(ts.transpileModule(`(${formatter.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    sellersList: [{ id: 'jazmin', full_name: 'Jazmín Sánchez' }],
    dbPaymentMethods: [], advertisingSources: [], orderMediums: [],
    cleanDeliveryNotes: value => value,
  });
  const summary = await format(stored);
  assert.equal(summary.seller_id, undefined);
  assert.equal(summary.totals, undefined);
  const state = await check({ input: summary, stored });
  assert.equal(state.result, 'allowed');
  assert.equal(state.reads, 1);
  assert.equal(state.loadedOrder, stored);
  assert.equal(state.loadedOrder.client_id, 'client-1');
  assert.equal(state.loadedOrder.totals.order_discount_amount, 12250);
});

test('stale or forged summary ownership never overrides the current database assignment', async () => {
  const state = await check({ input: { id: 'order-1', seller_id: 'jazmin' }, sellerId: 'other' });
  assert.equal(state.result, undefined);
  assert.match(state.notice, /asignados a tu usuario/);
});

test('missing or inaccessible orders and read failures stop before populating the editor', async () => {
  for (const args of [{ stored: null }, { readError: { code: '42501' } }, { readThrows: true }]) {
    const state = await check(args);
    assert.equal(state.result, undefined);
    assert.equal(state.loadedOrder, undefined);
    assert.match(state.notice, /cargar el pedido/);
  }
});

test('the current cancelled status prevents editing even if the summary was pending', async () => {
  const state = await check({ stored: { id: 'order-1', seller_id: 'jazmin', status: 'Cancelado' } });
  assert.equal(state.result, undefined);
  assert.match(state.notice, /Reactivá/);
});

test('administrators retain access with a verified session', async () => {
  assert.equal((await check({ role: 'admin', userId: 'admin' })).result, 'allowed');
  assert.equal((await check({ role: 'admin', userId: null })).result, undefined);
});
