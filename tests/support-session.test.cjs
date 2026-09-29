const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require: name => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  }, Headers, ...globals });
  return exports;
}
const session = token => ({ access_token: token, user: { id: 'owner' } });
const reply = (status, error = '') => new Response(JSON.stringify({ error }), { status });

test('a delayed 401 uses the token already renewed by another request', async () => {
  let current = session('old');
  let releaseDelayed;
  const delayed = new Promise(resolve => { releaseDelayed = resolve; });
  let refreshes = 0;
  const auth = {
    getSession: async () => ({ data: { session: current } }),
    refreshSession: async () => {
      refreshes++;
      current = session('new');
      return { data: { session: current } };
    }
  };
  const lib = load('src/lib/support/client.ts', { '@/lib/supabase': { supabase: { auth } } }, {
    fetch: async (url, options) => {
      if (options.headers.get('Authorization') === 'Bearer new') return reply(200);
      if (url.endsWith('notifications')) await delayed;
      return reply(401);
    }
  });
  const first = lib.supportRequest('me');
  const second = lib.supportRequest('notifications');
  await first;
  releaseDelayed();
  await second;
  assert.equal(refreshes, 1);
});

test('connection failures preserve the session and do not refresh or resend', async () => {
  let calls = 0;
  const auth = {
    getSession: async () => ({ data: { session: session('valid') } }),
    refreshSession: () => assert.fail('Connection failure must not renew tokens')
  };
  const lib = load('src/lib/support/client.ts', { '@/lib/supabase': { supabase: { auth } } }, {
    fetch: async () => { calls++; return reply(503, 'No se pudo verificar la sesión.'); }
  });
  await assert.rejects(lib.supportRequest('me'), e => e.status === 503);
  assert.equal(calls, 1);
});

test('an account change after a rejected mutation never resends it', async () => {
  let current = session('old');
  let calls = 0;
  const auth = {
    getSession: async () => ({ data: { session: current } }),
    refreshSession: () => assert.fail('Must not renew another account')
  };
  const lib = load('src/lib/support/client.ts', { '@/lib/supabase': { supabase: { auth } } }, {
    fetch: async () => {
      calls++;
      current = { access_token: 'other', user: { id: 'another-owner' } };
      return reply(401);
    }
  });
  await assert.rejects(lib.supportRequest('tickets', { method: 'POST', body: '{}' }), /La cuenta cambió/);
  assert.equal(calls, 1);
});

test('server distinguishes unavailable authentication from invalid credentials', async () => {
  class SupportError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  for (const [error, expected] of [
    [{ name: 'AuthRetryableFetchError', status: 0 }, 503],
    [{ name: 'AuthApiError', status: 503 }, 503],
    [{ name: 'AuthApiError', status: 429 }, 503],
    [{ name: 'AuthApiError', status: 401, code: 'bad_jwt' }, 401]
  ]) {
    const lib = load('src/lib/support/server.ts', {
      '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error }) } }) },
      'next/server': {},
      '@/lib/impersonation': {},
      './validation': { SupportError }
    }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } } });
    await assert.rejects(lib.authorize({ headers: new Headers({ authorization: 'Bearer test' }) }), e => e.status === expected);
  }
});
