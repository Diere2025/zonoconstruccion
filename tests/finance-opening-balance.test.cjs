const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function route(prior) {
  const exports = {};
  let reads = 0;
  const db = {
    rpc: async () => prior,
    from: () => {
      reads++;
      const query = { then: resolve => Promise.resolve({ data: [], error: null }).then(resolve) };
      for (const method of ['select', 'lte', 'gte', 'order', 'range']) query[method] = () => query;
      return query;
    }
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/finanzas-data/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText, {
    exports, process: { env: {} }, URL, Date,
    console: { error() {} },
    require: name => name === '@supabase/supabase-js' ? { createClient: () => db }
      : name === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
      : { compareTreasuryTransactions: () => 0 }
  });
  return { GET: exports.GET, reads: () => reads };
}

test('opening balance timeout fails the response before loading movements', async () => {
  const api = route({ error: { code: '57014', message: 'canceling statement due to statement timeout' } });
  const response = await api.GET({ url: 'https://example.test/api?action=transactions&startDate=2026-09-01' });
  assert.equal(response.status, 503);
  assert.equal(api.reads(), 0);
  assert.equal(response.body.transactions, undefined);
});

test('missing opening balance payload cannot become a zero balance', async () => {
  const api = route({ data: null, error: null });
  const response = await api.GET({ url: 'https://example.test/api?action=transactions&startDate=2026-09-01' });
  assert.equal(response.status, 500);
  assert.equal(api.reads(), 0);
});
