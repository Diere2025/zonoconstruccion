const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function guard({ user = { id: 'u1', email: 'operator@example.test' }, seller = null, error = null } = {}) {
  let reads = 0;
  const db = { from: () => {
    reads++;
    const q = { maybeSingle: async () => ({ data: seller, error }) };
    q.select = q.eq = q.ilike = () => q;
    return q;
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/purchaseAccess.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText, {
    exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' } },
    require: () => ({ createClient: (_url, key) => key === 'anon' ? { auth: { getUser: async () => ({ data: { user }, error: null }) } } : db })
  });
  return { check: headers => exports.requirePurchaseOperator({ headers: new Headers(headers) }), reads: () => reads };
}

test('missing and expired sessions cannot read supplier receipts', async () => {
  const missing = guard();
  assert.equal((await missing.check({})).status, 401);
  assert.equal(missing.reads(), 0);
  assert.equal((await guard({ user: null }).check({ authorization: 'Bearer expired' })).status, 401);
});
test('administration and self-declared metadata cannot grant purchase access', async () => {
  const api = guard({ user: { id: 'u1', email: 'admin-operator@example.test', user_metadata: { role: 'admin', roles: ['admin'] } }, seller: { role: 'administracion', roles: ['seller'], is_active: true } });
  assert.equal((await api.check({ authorization: 'Bearer valid' })).status, 403);
});
test('database administrator roles and configured administrators are allowed', async () => {
  for (const seller of [{ role: 'admin', is_active: true }, { role: 'administracion', roles: ['admin'], is_active: true }]) {
    assert.equal(await guard({ seller }).check({ authorization: 'Bearer valid' }), null);
  }
  assert.equal(await guard({ user: { id: 'u1', email: 'diego.boveda@gmail.com' } }).check({ authorization: 'Bearer valid' }), null);
});
test('inactive administrators and unavailable permissions fail closed', async () => {
  assert.equal((await guard({ seller: { role: 'admin', is_active: false } }).check({ authorization: 'Bearer valid' })).status, 403);
  assert.equal((await guard({ error: { message: 'database unavailable' } }).check({ authorization: 'Bearer valid' })).status, 503);
});


test('Compras, normalized multi-roles and trusted app roles can register receipts',async()=>{
 for(const seller of [{role:'compras',is_active:true},{role:'seller',roles:[' Compras '],is_active:true}])assert.equal(await guard({seller}).check({authorization:'Bearer valid'}),null);
 assert.equal(await guard({user:{id:'u1',app_metadata:{roles:['compras']}}}).check({authorization:'Bearer valid'}),null);
 assert.equal(await guard({user:{id:'u1',app_metadata:{roles:['admin']}}}).check({authorization:'Bearer valid'}),null);
 assert.equal((await guard({seller:{role:'compras',is_active:false}}).check({authorization:'Bearer valid'})).status,403);
});
