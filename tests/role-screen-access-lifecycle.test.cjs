const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  let state, deps, pendingEffect, cleanup, authRefresh;
  const requests = [], listeners = new Map();
  const exports = {};
  const react = {
    useState(initial) { state ??= initial; return [state, value => { state = value; }]; },
    useEffect(effect, nextDeps) {
      if (!deps || nextDeps.some((value, index) => value !== deps[index])) {
        pendingEffect = effect;
        deps = nextDeps;
      }
    },
  };
  const modules = {
    react,
    '@/lib/supabase': { supabase: { auth: { onAuthStateChange: callback => {
      authRefresh = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    } } } },
    '@/lib/authenticatedRequest': { createAuthenticatedRequester: () => () => new Promise((resolve, reject) => requests.push({ resolve, reject })) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/useRoleScreenAccess.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => modules[name], Error,
    window: { setInterval: callback => { listeners.set('interval', callback); return 1; }, clearInterval() {},
      addEventListener: (event, callback) => listeners.set(event, callback), removeEventListener: event => listeners.delete(event) },
  });
  return {
    requests,
    render(identity = 'jazmin', enabled = true, url = '/vendedores/pedidos?tab=list') {
      const result = exports.useRoleScreenAccess(identity, enabled, url);
      if (pendingEffect) { cleanup?.(); const effect = pendingEffect; pendingEffect = undefined; cleanup = effect(); }
      return result;
    },
    refresh: event => event === 'auth' ? authRefresh() : listeners.get(event)(),
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('query and route changes reuse identity permissions without clearing readiness', async () => {
  const f = fixture();
  assert.equal(f.render().ready, false);
  f.requests[0].resolve({ overrides: { seller: { 'ventas-1': true } } });
  await tick();
  assert.equal(f.render().ready, true);
  for (const url of ['/vendedores/pedidos?tab=form', '/vendedores/pedidos?search=JS26496', '/vendedores/clientes']) {
    const result = f.render('jazmin', true, url);
    assert.equal(result.ready, true);
    assert.equal(result.overrides.seller['ventas-1'], true);
  }
  assert.equal(f.requests.length, 1);
});

test('identity changes immediately hide old permissions and ignore late responses', async () => {
  const f = fixture();
  f.render();
  assert.equal(f.render('other').ready, false);
  f.requests[0].resolve({ overrides: { seller: { 'ventas-1': true } } });
  await tick();
  assert.equal(f.render('other').ready, false);
  f.requests[1].resolve({ overrides: { seller: { 'ventas-1': false } } });
  await tick();
  assert.equal(f.render('other').ready, true);
  assert.equal(f.render('other').overrides.seller['ventas-1'], false);
  assert.equal(f.render('other', false).ready, false);
});

test('focus, interval, explicit refresh and authentication still reload permissions', async () => {
  const f = fixture();
  f.render();
  f.requests[0].resolve({ overrides: {} });
  await tick();
  for (const event of ['focus', 'interval', 'erp-screen-access-updated', 'auth']) {
    f.refresh(event);
    assert.equal(f.render().ready, true, 'a pending refresh retains the mounted screen');
    f.requests.at(-1).resolve({ overrides: {} });
    await tick();
  }
  assert.equal(f.requests.length, 5);
});

test('permission refresh failures fail closed and an explicit retry recovers', async () => {
  const f = fixture();
  f.render();
  f.requests[0].resolve({ overrides: {} });
  await tick();
  f.refresh('focus');
  f.requests[1].reject(new Error('Unavailable'));
  await tick();
  assert.equal(f.render().ready, false);
  assert.equal(f.render().error, 'Unavailable');
  f.refresh('erp-screen-access-updated');
  f.requests[2].resolve({ overrides: {} });
  await tick();
  assert.equal(f.render().ready, true);
});
