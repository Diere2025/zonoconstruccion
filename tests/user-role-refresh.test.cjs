const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

function evaluate(file, imports, extras = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, { exports, require: imports, ...extras });
  return exports;
}
const profileLib = evaluate('src/lib/userRoleProfile.ts', require);
const navigation = evaluate('src/lib/erpNavigation.ts', require, { URLSearchParams });
const navigationContext = evaluate('src/components/ui/ErpNavigationContext.tsx', require);
const laura = { id: 'laura', email: 'lauraguerra@zono.com.ar', user_metadata: { role: 'seller' } };
const administration = { id: laura.id, role: 'administracion', roles: ['administracion'] };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function mount({ storedUser = laura, result = { data: administration, error: null }, user = laura } = {}) {
  const source = fs.readFileSync('src/components/ui/AdminLayout.tsx', 'utf8');
  const names = [...source.matchAll(/const \[(\w+),[^\]]*\]\s*=\s*useState/g)].map(m => m[1]);
  const state = new Map();
  const storage = new Map(storedUser ? [
    ['zono_user_id', storedUser.id], ['zono_user_email', storedUser.email],
    ['zono_user_role', 'administracion'], ['zono_user_roles', '["administracion"]'], ['zono_role_loaded', 'true']
  ] : []);
  const sessionStorage = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
  const effects = [], timers = new Map();
  let cursor = 0, timerId = 0, activeUser = user, queryResult = result, listener;
  const hooks = { ...React, useState: initial => {
    const name = names[cursor++];
    state.set(name, typeof initial === 'function' ? initial() : initial);
    return [state.get(name), value => state.set(name, typeof value === 'function' ? value(state.get(name)) : value)];
  }, useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  const supabase = { auth: {
    getUser: async () => ({ data: { user: activeUser }, error: null }),
    getSession: async () => ({ data: { session: { user: activeUser } } }),
    onAuthStateChange: fn => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; }
  }, from: () => {
    const q = { select: () => q, eq: () => q, ilike: () => q, maybeSingle: async () => queryResult };
    return q;
  } };
  const modules = {
    react: hooks, '@/lib/supabase': { supabase }, '@/lib/userRoleProfile': profileLib,
    '@/lib/authenticatedRequest': evaluate('src/lib/authenticatedRequest.ts', require, { fetch, Headers }),
    '@/lib/erpNavigation': navigation, '@/components/ui/ErpNavigationContext': navigationContext,
    'next/navigation': { usePathname: () => '/admin/finanzas', useRouter: () => ({}), useSearchParams: () => new URLSearchParams() }
  };
  const layout = evaluate('src/components/ui/AdminLayout.tsx', name => modules[name] || require(name), {
    console: { warn() {} }, sessionStorage, localStorage: { getItem: () => null }, URLSearchParams,
    window: { innerWidth: 1280, location: { hostname: 'localhost' } },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id)
  });
  const element = layout.AdminLayout({ children: null });
  element.props.children.type({ children: null });
  // Run the identity effect only, avoiding unrelated impersonation API calls.
  const cleanup = effects.find(fn => fn.toString().includes('getUserDetails'))();
  return { state, storage, timers, cleanup, changeUser: next => { activeUser = next; listener('SIGNED_IN'); }, retry: async r => {
    queryResult = r;
    const [id, fn] = timers.entries().next().value;
    timers.delete(id); fn(); await flush();
  } };
}

test('refresh uses the database role even when session metadata says seller', async () => {
  const m = mount(); await flush();
  assert.equal(m.state.get('userRole'), 'administracion');
  assert.equal(m.storage.get('zono_user_role'), 'administracion');
  assert.equal(m.state.get('isRoleLoaded'), true);
  m.cleanup();
});

test('failed refresh preserves Laura’s verified role and retries without persisting seller', async () => {
  const m = mount({ result: { data: null, error: { message: 'Unavailable' } } }); await flush();
  assert.equal(m.state.get('userRole'), 'administracion');
  assert.equal(m.storage.get('zono_user_role'), 'administracion');
  assert.equal(m.timers.size, 1);
  await m.retry({ data: administration, error: null });
  assert.equal(m.state.get('isRoleLoaded'), true);
  assert.equal(m.timers.size, 0); m.cleanup();
});

test('fresh sessions do not verify a default seller when the lookup fails', async () => {
  const m = mount({ storedUser: null, result: { data: null, error: { message: 'Unavailable' } } }); await flush();
  assert.equal(m.state.get('isRoleLoaded'), false);
  assert.equal(m.storage.has('zono_user_role'), false);
  m.cleanup(); assert.equal(m.timers.size, 0);
});

test('another user cannot inherit Laura’s cached role', async () => {
  const m = mount({ user: { ...laura, id: 'other', email: 'other@example.test' }, result: { data: null, error: { message: 'Unavailable' } } }); await flush();
  assert.equal(m.state.get('isRoleLoaded'), false);
  assert.equal(m.storage.has('zono_user_role'), false); m.cleanup();
});

test('a real role change to seller replaces the cached administration role', async () => {
  const m = mount({ result: { data: { ...administration, role: 'seller', roles: ['seller'] }, error: null } }); await flush();
  assert.equal(m.storage.get('zono_user_role'), 'seller'); m.cleanup();
});

test('leaving the screen cancels a pending role response', async () => {
  let resolve;
  const m = mount({ storedUser: null, result: new Promise(r => { resolve = r; }) }); await flush();
  m.cleanup(); resolve({ data: administration, error: null }); await flush();
  assert.equal(m.storage.has('zono_user_role'), false);
});

test('changing sessions invalidates a role query that is still pending', async () => {
  let resolve;
  const m = mount({ result: new Promise(r => { resolve = r; }) }); await flush();
  m.changeUser({ ...laura, id: 'other', email: 'other@example.test' });
  resolve({ data: { ...administration, role: 'seller', roles: ['seller'] }, error: null }); await flush();
  assert.equal(m.state.get('isRoleLoaded'), false);
  assert.equal(m.storage.get('zono_user_role'), 'administracion');
  await m.retry({ data: null, error: { message: 'Unavailable' } });
  assert.equal(m.storage.has('zono_user_role'), false); m.cleanup();
});

test('profile lookup prefers ID, escapes email fallback and propagates errors', async () => {
  const load = profileLib.loadUserRoleProfile;
  assert.equal(await load(laura, async () => ({ data: administration, error: null }), () => { throw Error('Unexpected email lookup'); }), administration);
  await load({ id: 'old', email: 'A_B%Example@test' }, async () => ({ data: null, error: null }), async email => {
    assert.equal(email, 'a\\_b\\%example@test'); return { data: administration, error: null };
  });
  await assert.rejects(load(laura, async () => ({ data: null, error: { message: 'Permission denied' } }), () => { throw Error('Unexpected fallback'); }), /Permission denied/);
});
