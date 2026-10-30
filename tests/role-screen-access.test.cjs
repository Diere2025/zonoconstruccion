const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function evaluate(file, imports = require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: imports, URL, URLSearchParams, Set, Number, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service' } } });
  return exports;
}
const nav = evaluate('src/lib/erpNavigation.ts');
const access = evaluate('src/lib/roleScreenAccess.ts');
const urls = modules => modules.flatMap(module => module.links.map(link => link.href));
const identity = (roles, screenOverrides = {}) => ({ roles, screenOverrides, restrictedSeller: false, canUseWholesale: true });

test('empty settings preserve existing navigation for every role', () => {
  for (const role of ['admin', ...access.configurableRoles.map(role => role.id)]) {
    const user = identity([role]);
    assert.deepEqual(urls(nav.visibleErpModules(user)), urls(nav.defaultErpModules(user)));
  }
});
test('grant and revoke affect menu and direct destinations', () => {
  const user = identity(['compras'], { compras: { 'compras-1': false, 'inventario-1': true } });
  const visible = urls(nav.visibleErpModules(user));
  assert.ok(!visible.includes('/admin/compras?tab=purchase_orders'));
  assert.ok(visible.includes('/admin/catalogo'));
  assert.equal(nav.configuredScreenDecision(user, '/admin/compras', ''), false);
  assert.equal(nav.configuredScreenDecision(user, '/admin/catalogo', ''), true);
  assert.equal(nav.configuredScreenDecision(user, '/admin/catalogo/producto', ''), true);
  assert.equal(nav.configuredScreenDecision(user, '/admin/compras', '?tab=purchase_calculator'), null);
  assert.equal(nav.configuredScreenDecision(user, '/admin/compras', '?tab=unknown'), false);
});
test('multiple roles receive union including inherited access', () => {
  const settings = { compras: { 'inventario-2': false }, administracion: { 'inventario-2': true } };
  assert.equal(nav.configuredScreenDecision(identity(['compras', 'administracion'], settings), '/admin/stock', ''), true);
  assert.equal(nav.configuredScreenDecision(identity(['compras'], settings), '/admin/stock', ''), false);
  assert.equal(nav.configuredScreenDecision(identity(['compras', 'administracion'], { administracion: { 'inventario-2': false } }), '/admin/stock', ''), true);
});
test('administrator access and private and security destinations remain protected', () => {
  const user = identity(['admin'], { admin: { 'inventario-1': false } });
  assert.ok(urls(nav.visibleErpModules(user)).includes('/admin/catalogo'));
  assert.equal(nav.configuredScreenDecision(user, '/admin/catalogo', ''), null);
  const seller = identity(['seller'], { seller: { 'soporte-accesos': true, 'soporte-3': true, 'direccion-prompts': true, 'desarrollos-futuros-1': true } });
  const visible = urls(nav.visibleErpModules(seller));
  for (const path of ['/admin/accesos', '/admin/vendedores', '/admin/prompts-campanas', '/desarrollos-futuros']) assert.ok(!visible.includes(path));
});
test('individual sales restrictions cannot be overridden by screen settings', () => {
  const user = { ...identity(['seller'], { seller: { 'inventario-1': true } }), restrictedSeller: true, canUseWholesale: false };
  assert.equal(nav.configuredScreenDecision(user, '/admin/catalogo', ''), false);
  assert.ok(!urls(nav.visibleErpModules(user)).includes('/vendedores/presupuestos-mayorista'));
});
test('printing aliases and finance tabs resolve the configured permission', () => {
  const user = identity(['logistica'], { logistica: { 'logistica-3': false } });
  assert.equal(nav.configuredScreenDecision(user, '/vendedores/ruteo/remitos', ''), false);
  const finance = nav.erpModules.flatMap(module => module.links).find(link => link.href === '/admin/finanzas?tab=accounts');
  assert.ok(finance);
  assert.equal(nav.configuredScreenDecision(identity(['administracion'], { administracion: { [finance.id]: false } }), '/admin/finanzas', '?tab=accounts'), false);
});
test('validation rejects forged roles, protected links, arrays and non-boolean grants', () => {
  const ids = new Set(nav.erpModules.flatMap(module => module.links.filter(nav.isConfigurableScreen).map(link => link.id)));
  for (const value of [null, [], { admin: {} }, { seller: [] }, { seller: { 'soporte-accesos': true } }, { seller: { unknown: true } }, { seller: { 'inventario-1': 'yes' } }]) assert.equal(access.validateScreenOverrides(value, ids), false);
  assert.equal(access.validateScreenOverrides({ seller: { 'inventario-1': true } }, ids), true);
  assert.equal(access.validateScreenOverrides({}, ids), true);
});

function fixture({ user = { id: 'user' }, admin = true, dbError = null, rpcError = null } = {}) {
  const writes = [];
  const db = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { overrides: {}, revision: 2 }, error: dbError }) }) }) }),
    rpc: async (name, args) => { writes.push({ name, args }); return { data: { overrides: args.p_overrides, revision: 3 }, error: rpcError }; },
  };
  const api = evaluate('src/app/api/role-screen-access/route.ts', name => {
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name === '@/lib/erpNavigation') return nav;
    if (name === '@/lib/roleScreenAccess') return access;
    if (name === '@/lib/systemAdminAccess') return { authenticateSystemAdministrator: async () => admin ? { user } : { user: null, status: 403, error: 'Acceso denegado' } };
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) } };
    throw new Error(name);
  });
  const request = (body, token = 'valid', query = '') => ({ url: `https://example.test/api/role-screen-access${query}`,
    headers: { get: () => token ? `Bearer ${token}` : null }, json: async () => body });
  return { api, request, writes };
}
test('configuration read requires a session; management read requires an administrator', async () => {
  const f = fixture({ admin: false });
  assert.equal((await f.api.GET(f.request(null, null))).status, 401);
  assert.equal((await f.api.GET(f.request(null))).status, 200);
  assert.equal((await f.api.GET(f.request(null, 'valid', '?manage=1'))).status, 403);
  assert.equal((await fixture({ user: null }).api.GET(f.request(null))).status, 401);
});
test('only missing migration falls back to defaults; database outages fail closed', async () => {
  const missing = fixture({ dbError: { code: '42P01' } });
  assert.equal((await missing.api.GET(missing.request())).body.available, false);
  const failed = fixture({ dbError: { code: '08006' } });
  assert.equal((await failed.api.GET(failed.request())).status, 503);
});
test('save authenticates admin, validates grants and records the verified actor and revision', async () => {
  const denied = fixture({ admin: false });
  assert.equal((await denied.api.PUT(denied.request({}))).status, 403);
  assert.equal(denied.writes.length, 0);
  const f = fixture();
  for (const body of [null, {}, { revision: -1, overrides: {} }, { revision: 0, overrides: { admin: {} } }, { revision: 0, overrides: { seller: { 'soporte-3': true } } }]) assert.equal((await f.api.PUT(f.request(body))).status, 400);
  assert.equal(f.writes.length, 0);
  const result = await f.api.PUT(f.request({ revision: 2, overrides: { compras: { 'inventario-1': true } }, updated_by: 'forged' }));
  assert.equal(result.status, 200);
  assert.equal(f.writes[0].args.p_actor, 'user');
  assert.equal(f.writes[0].args.p_revision, 2);
});
test('concurrent save returns conflict without silently overwriting', async () => {
  const f = fixture({ rpcError: { code: '40001' } });
  assert.equal((await f.api.PUT(f.request({ revision: 1, overrides: {} }))).status, 409);
});
