const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function endpoint(authResult) {
  const exports = {};
  let queries = 0;
  let config;
  const plans = [2, 3, 6, 9, 12, 18].map((installments, index) => ({
    name: `Cuota Simple x${installments} (oct26)`, surcharge_percentage: [22, 28, 45.5, 70, 93, 141][index]
  }));
  const client = {
    auth: { getUser: async () => authResult },
    from() {
      queries++;
      const query = {
        then(resolve, reject) { return Promise.resolve({ data: plans, error: null }).then(resolve, reject); },
        maybeSingle: async () => ({ data: { role: 'vendedor', roles: [] }, error: null })
      };
      for (const method of ['select', 'eq', 'in', 'update']) query[method] = () => query;
      return query;
    }
  };
  const modules = {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@supabase/supabase-js': { createClient: (_, __, options) => { config = options; return client; } },
    '@/lib/cuotaSimple': { CUOTA_SIMPLE_PLANS: plans, POINT_ONE_PAYMENT_PLAN: { name: 'Point 1 Pago (oct26)', surcharge_percentage: 7 } },
    '@/lib/logisticsOrderNotes': { DEFAULT_ORDER_NOTE_RATES: plans.map(plan => plan.surcharge_percentage) }
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/logistica/nota-pedido-config/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports, require: name => modules[name], console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key' } },
    fetch: async (_, init) => { assert.equal(init.cache, 'no-store'); return new Response(); }
  });
  return {
    request: (method, token) => exports[method](new Request('https://example.test/api/logistica/nota-pedido-config', {
      method, headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(method === 'PUT' ? { body: JSON.stringify({ rates: [22, 28, 45.5, 70, 93, 141] }) } : {})
    })),
    queries: () => queries, config: () => config
  };
}

test('missing or expired sessions cannot read or update rates', async () => {
  for (const method of ['GET', 'PUT']) {
    const api = endpoint({ data: { user: null }, error: { name: 'AuthApiError', status: 401 } });
    assert.equal((await api.request(method)).status, 401);
    assert.equal((await api.request(method, 'expired')).status, 401);
    assert.equal(api.queries(), 0);
  }
});

test('network and temporary auth failures return 503 without claiming the user signed out', async () => {
  for (const method of ['GET', 'PUT']) {
    for (const error of [{ name: 'AuthRetryableFetchError', status: 0 }, { name: 'AuthApiError', status: 429 }, { name: 'AuthApiError', status: 503 }]) {
      const api = endpoint({ data: { user: null }, error });
      const response = await api.request(method, 'valid');
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /No se pudo verificar la sesión/);
      assert.equal(api.queries(), 0);
    }
  }
});

test('authenticated sellers can read all six rates with caching disabled', async () => {
  const api = endpoint({ data: { user: { id: 'seller' } }, error: null });
  const response = await api.request('GET', 'valid');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).rates, [22, 28, 45.5, 70, 93, 141]);
  assert.equal(api.config().auth.persistSession, false);
  await api.config().global.fetch('https://example.test/auth', {});
  assert.equal((await api.request('PUT', 'valid')).status, 403);
});
