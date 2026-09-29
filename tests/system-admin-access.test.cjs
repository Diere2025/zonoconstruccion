const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function evaluate(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText, {
    exports, require: imports, console, Date,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service' } }
  });
  return exports;
}
const access = evaluate('src/lib/systemAdminAccess.ts', require);

function fixture({ user = { id: 'admin-id', email: 'operator@example.test' },
  seller = { role: 'seller', roles: ['seller', 'admin'], is_active: true },
  fallback = null, profileError = null, authError = null, listError = null, ticket = null } = {}) {
  const queries = [], generatedLinks = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: authError }),
      admin: {
        listUsers: async () => ({ data: { users: [{ id: 'target', email: 'target@example.test' }] }, error: listError }),
        getUserById: async () => ({ data: { user: { id: 'target', email: 'target@example.test' } }, error: null }),
        generateLink: async options => { generatedLinks.push(options); return { data: { properties: { hashed_token: 'magic-token' } }, error: null }; }
      }
    },
    from: table => {
      let field, value;
      const q = {
        select: () => q, order: () => q,
        eq: (f, v) => { field = f; value = v; return q; },
        ilike: (f, v) => { field = f; value = v; return q; },
        maybeSingle: async () => {
          queries.push({ table, field, value });
          if (value === 'target') return { data: { id: 'target', email: 'target@example.test', is_active: true, role: 'seller' }, error: null };
          return { data: field === 'email' ? fallback : seller, error: profileError };
        },
        then: resolve => Promise.resolve({ data: table === 'sellers' ? [{ id: 'target', email: 'target@example.test', is_active: true }] : [], error: null }).then(resolve)
      };
      return q;
    }
  };
  const imports = name => {
    if (name === '@supabase/supabase-js') return { createClient: () => client };
    if (name === '@/lib/systemAdminAccess') return access;
    if (name === '@/lib/impersonation') return { signImpersonationTicket: async () => 'signed-ticket', verifyImpersonationTicket: async () => ticket };
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: new Headers(), cookies: { set() {} } }) } };
    throw new Error(`Unexpected import: ${name}`);
  };
  const request = (body, token = 'valid') => ({
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
    url: 'https://example.test/api/admin/vendedores?callerEmail=diego.boveda@gmail.com&callerRole=admin',
    cookies: { get: () => ticket ? { value: 'signed-ticket' } : null }, nextUrl: { protocol: 'https:' }, json: async () => body
  });
  return { client, queries, generatedLinks, request,
    check: (token = 'valid') => access.authenticateSystemAdministrator(request(null, token), client),
    sellers: evaluate('src/app/api/admin/vendedores/route.ts', imports),
    impersonate: evaluate('src/app/api/admin/impersonate/route.ts', imports) };
}

test('additional database admin role permits listing users and starting Ver como', async () => {
  const f = fixture();
  const list = await f.sellers.GET(f.request());
  assert.equal(list.status, 200);
  assert.equal(list.body.data[0].auth_user.id, 'target');
  const result = await f.impersonate.POST(f.request({ action: 'start', targetUserId: 'target' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.tokenHash, 'magic-token');
  assert.equal(f.generatedLinks[0].email, 'target@example.test');
  assert.equal((await f.impersonate.POST(f.request({ action: 'cancel' }))).status, 200);
});

test('legacy profiles linked by email can list users and start Ver como', async () => {
  const f = fixture({ seller: null, fallback: { role: ' ADMIN ', is_active: true } });
  assert.equal((await f.sellers.GET(f.request())).status, 200);
  assert.equal((await f.impersonate.POST(f.request({ action: 'start', targetUserId: 'target' }))).status, 200);
  assert.ok(f.queries.some(q => q.field === 'email' && q.value === 'operator@example.test'));
});

test('administrator with an additional role can finish returning to their session', async () => {
  const f = fixture({ ticket: { administratorId: 'admin-id' } });
  assert.equal((await f.impersonate.POST(f.request({ action: 'finish' }))).status, 200);
  const other = fixture({ ticket: { administratorId: 'another-admin' } });
  assert.equal((await other.impersonate.POST(other.request({ action: 'finish' }))).status, 403);
});

test('ID profile takes precedence over an email profile', async () => {
  const f = fixture({ seller: { role: 'seller' }, fallback: { role: 'admin' } });
  assert.equal((await f.check()).status, 403);
  assert.ok(f.queries.every(q => q.field !== 'email'));
});

test('primary, additional and server metadata roles and configured administrators are accepted', async () => {
  for (const options of [
    { seller: { role: 'admin' } },
    { seller: { role: 'compras', roles: [' Admin '] } },
    { seller: null, user: { id: 'admin-id', app_metadata: { roles: ['admin'] } } },
    { seller: null, user: { id: 'admin-id', email: 'DIEGO.BOVEDA@gmail.com' } }
  ]) assert.ok((await fixture(options).check()).user);
});

test('unverified claims, missing tokens, inactive users and failed authentication are rejected', async () => {
  const f = fixture({ user: { id: 'u', email: 'diego-admin@example.test', user_metadata: { role: 'admin' } }, seller: { role: 'seller' } });
  assert.equal((await f.sellers.GET(f.request(null, null))).status, 401);
  assert.equal((await f.sellers.GET(f.request())).status, 403);
  assert.equal((await f.sellers.POST(f.request({ action: 'create', callerRole: 'admin' }))).status, 403);
  assert.equal((await f.impersonate.POST(f.request({ action: 'start', targetUserId: 'target' }))).status, 403);
  assert.equal(f.generatedLinks.length, 0);
  assert.equal((await fixture({ seller: { role: 'admin', is_active: false } }).check()).status, 403);
  assert.equal((await fixture({ authError: { message: 'expired' } }).check()).status, 401);
});

test('permission and auth directory failures are reported instead of an empty user list', async () => {
  assert.equal((await fixture({ profileError: { message: 'unavailable' } }).check()).status, 503);
  const f = fixture({ listError: { message: 'unavailable' } });
  const result = await f.sellers.GET(f.request());
  assert.equal(result.status, 503);
  assert.match(result.body.error, /cuentas de acceso/);
});
