const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleLoadOrderIntoForm') handler = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
// Exercise the actual opening guards, stopping before loading the form's data.
const statements = handler.body.statements;
const firstWrite = statements.findIndex(node => node.getText(ast) === 'isEditingRef.current = true;');
assert.ok(firstWrite > 0);
const opening = ts.transpileModule(`(async (order, isClone = false) => {
  ${statements.slice(0, firstWrite).map(node => node.getText(ast)).join('\n')}
  return 'allowed';
})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function check({ currentUserId = '', userId = 'jazmin', role = 'seller', sellerId = 'jazmin', error = null, throws = false, isClone = false } = {}) {
  const state = { notice: '', userId: currentUserId };
  const open = vm.runInNewContext(opening, {
    currentUserId, role,
    supabase: { auth: { getUser: async () => {
      if (throws) throw new Error('Network failure');
      return { data: { user: userId ? { id: userId } : null }, error };
    } } },
    setCurrentUserId: id => { state.userId = id; },
    setOrderSaveNotice: notice => { state.notice = notice; },
  });
  state.result = await open({ seller_id: sellerId, status: 'Pendiente' }, isClone);
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
  }
});

test('administrators retain access with a verified session', async () => {
  assert.equal((await check({ role: 'admin', userId: 'admin' })).result, 'allowed');
  assert.equal((await check({ role: 'admin', userId: null })).result, undefined);
});
