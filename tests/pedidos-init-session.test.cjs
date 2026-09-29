const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function endpoint(authResult) {
  const exports = {};
  let queries = 0;
  let options;
  const client = {
    auth: { getUser: async () => authResult },
    from(table) {
      queries++;
      const result = { data: [], error: null };
      const query = {
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
        maybeSingle: async () => ({ data: { id: 'owner', role: 'admin', seller_type: 'minorista' }, error: null }),
      };
      for (const method of ['select', 'eq', 'order', 'limit', 'range', 'in', 'update', 'insert']) query[method] = () => query;
      if (table === 'advertising_sources') result.data = ['Cliente', 'Página web', 'Reenviado de Minorista', 'Recomendado', 'Otro'].map(name => ({ name }));
      return query;
    },
  };
  const modules = {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@supabase/supabase-js': { createClient: (_, __, config) => { options = config; return client; } },
    '@/lib/erp/prices': { calculateBulkPrices: async () => ({}) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/vendedores/pedidos-init/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => modules[name], URL, process: { env: {} }, console,
    fetch: async (_, init) => { assert.equal(init.cache, 'no-store'); return new Response(); },
  });
  return { get: token => exports.GET(new Request('https://example.test/api/vendedores/pedidos-init?userId=owner', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })), queries: () => queries, options: () => options };
}

test('missing and expired sessions return 401 before reading business data', async () => {
  const api = endpoint({ data: { user: null }, error: { name: 'AuthApiError', status: 401 } });
  assert.equal((await api.get()).status, 401);
  assert.equal((await api.get('expired')).status, 401);
  assert.equal(api.queries(), 0);
});

test('temporary verification failures return 503 without misreporting permissions', async () => {
  for (const error of [{ name: 'AuthRetryableFetchError', status: 0 }, { name: 'AuthApiError', status: 429 }, { name: 'AuthApiError', status: 503 }]) {
    const api = endpoint({ data: { user: null }, error });
    assert.equal((await api.get('valid')).status, 503);
    assert.equal(api.queries(), 0);
  }
});

test('another account cannot request the target user data', async () => {
  const api = endpoint({ data: { user: { id: 'other' } }, error: null });
  assert.equal((await api.get('valid')).status, 403);
  assert.equal(api.queries(), 0);
});

test('a verified administrator can load the form, with session storage and fetch caching disabled', async () => {
  const api = endpoint({ data: { user: { id: 'owner' } }, error: null });
  const response = await api.get('valid');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).role, 'admin');
  assert.ok(api.queries() > 0);
  assert.equal(api.options().auth.persistSession, false);
  assert.equal(api.options().auth.autoRefreshToken, false);
  await api.options().global.fetch('https://example.test/auth', {});
});
