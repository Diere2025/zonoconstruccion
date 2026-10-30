const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('user management excludes archived profiles and keeps active and paused profiles', async () => {
  const sellers = [
    { id: 'active', email: 'active@example.test', is_active: true },
    { id: 'paused', email: 'paused@example.test', is_active: false, archived_at: null },
    { id: 'archived', email: 'archived@example.test', is_active: false, archived_at: '2026-10-30T00:00:00Z' },
  ];
  const client = {
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    from: table => {
      const chain = {
        select: () => chain, order: () => chain,
        then: resolve => Promise.resolve({ data: table === 'sellers' ? sellers : [], error: null }).then(resolve),
      };
      return chain;
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(process.env.SELLER_ARCHIVE_ROUTE || 'src/app/api/admin/vendedores/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, process: { env: {} }, console,
    require: name => {
      if (name === '@supabase/supabase-js') return { createClient: () => client };
      if (name === '@/lib/systemAdminAccess') return { authenticateSystemAdministrator: async () => ({ user: { id: 'admin' } }) };
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
      throw new Error(name);
    },
  });
  const result = await exports.GET({});
  assert.equal(result.status, 200);
  assert.equal(result.body.data.map(user => user.id).join(','), 'active,paused');
  assert.equal(sellers.length, 3, 'listing must preserve the historical profile');
});
