const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function evaluate(file, context) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, ...context }, { filename: file });
  return exports;
}

test('browser clients retain SDK token coordination and reuse the singleton', () => {
  for (const file of ['src/lib/supabase.ts', 'apps/web/src/lib/supabase.ts']) {
    const window = {};
    let calls = 0;
    const client = {};
    const context = { window, process: { env: {} }, require: () => ({ createClient: (_, __, options) => {
      calls++;
      assert.equal(options.auth.persistSession, true);
      assert.equal(options.auth.autoRefreshToken, true);
      assert.equal(options.auth.lock, undefined);
      return client;
    } }) };
    assert.equal(evaluate(file, context).supabase, client);
    assert.equal(evaluate(file, context).supabase, client);
    assert.equal(calls, 1);
  }
});

test('server clients do not persist or auto-refresh a shared user session', () => {
  for (const file of ['src/lib/supabase.ts', 'apps/web/src/lib/supabase.ts']) {
    evaluate(file, { global: {}, process: { env: {} }, require: () => ({ createClient: (_, __, options) => {
      assert.equal(options.auth.persistSession, false);
      assert.equal(options.auth.autoRefreshToken, false);
      assert.equal(options.auth.detectSessionInUrl, false);
      return {};
    } }) });
  }
});

async function mountAdmin() {
  let listener;
  let cleanup;
  let authLockHeld = false;
  let queries = 0;
  let unsubscribed = false;
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; }
    },
    from: () => {
      assert.equal(authLockHeld, false, 'database query attempted inside the auth lock');
      queries++;
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { role: 'seller' }, error: null }) };
      return query;
    }
  };
  const react = { useState: initial => [initial, () => {}], useEffect: effect => { cleanup = effect(); } };
  const lib = evaluate('src/app/admin/layout.tsx', {
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (name === 'next/navigation') return { useRouter: () => ({}) };
      if (name === '@/lib/supabase') return { supabase };
      return {};
    },
    window: { location: { hostname: 'localhost' } }, sessionStorage: storage,
    setTimeout, clearTimeout, console
  });
  lib.default({ children: null });
  await new Promise(resolve => setImmediate(resolve));
  return {
    emit: (event, session) => {
      authLockHeld = true;
      try { assert.equal(listener(event, session), undefined, 'auth listener must return synchronously'); }
      finally { authLockHeld = false; }
    },
    unmount: () => cleanup(), get queries() { return queries; }, get unsubscribed() { return unsubscribed; }
  };
}
const session = { user: { id: 'seller-user', email: 'seller@example.test', user_metadata: {} } };

test('admin role lookup runs after the auth event releases its lock', async () => {
  const mounted = await mountAdmin();
  try {
    mounted.emit('SIGNED_IN', session);
    assert.equal(mounted.queries, 0);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(mounted.queries, 1);
  } finally { mounted.unmount(); }
});

test('sign-out cancels a deferred role lookup', async () => {
  const mounted = await mountAdmin();
  try {
    mounted.emit('SIGNED_IN', session);
    mounted.emit('SIGNED_OUT', null);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(mounted.queries, 0);
  } finally { mounted.unmount(); }
});

test('unmount cancels deferred role lookup and unsubscribes', async () => {
  const mounted = await mountAdmin();
  mounted.emit('SIGNED_IN', session);
  mounted.unmount();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(mounted.queries, 0);
  assert.equal(mounted.unsubscribed, true);
});
