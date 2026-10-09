const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const lib = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/authenticatedRequest.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: lib, Headers, fetch, FormData });
const response = (status, body = {}) => new Response(JSON.stringify(body), { status });
const client = refreshSession => ({ auth: {
  getSession: async () => ({ data: { session: { access_token: 'old' } } }),
  refreshSession
} });

test('simultaneous identical reads share one request, later reads fetch fresh data', async () => {
  let calls = 0;
  const request = lib.createAuthenticatedRequester(client(), async () => {
    calls++;
    return response(200, { rows: [] });
  });
  const [first, second] = await Promise.all([request('/list'), request('/list')]);
  assert.equal(first, second);
  assert.equal(calls, 1);
  await request('/list');
  assert.equal(calls, 2);
});

test('concurrent expired requests share one session renewal and retry once', async () => {
  let refreshes = 0;
  let resolveRefresh;
  const waiting = new Promise(resolve => { resolveRefresh = resolve; });
  const request = lib.createAuthenticatedRequester(client(async () => {
    refreshes++;
    await waiting;
    return { data: { session: { access_token: 'new' } } };
  }), async (_, options) => response(options.headers.get('Authorization') === 'Bearer new' ? 200 : 401));
  const pending = Promise.all([request('/list'), request('/carriers')]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshes, 1);
  resolveRefresh();
  await pending;
});

test('permission and service failures do not renew tokens or repeat the query', async () => {
  for (const status of [403, 503]) {
    let calls = 0;
    const request = lib.createAuthenticatedRequester(client(() => assert.fail('Unexpected refresh')), async () => {
      calls++;
      return response(status, { error: 'unavailable' });
    });
    await assert.rejects(request('/list'), /unavailable/);
    assert.equal(calls, 1);
    await assert.rejects(request('/list'), /unavailable/);
    assert.equal(calls, 2);
  }
});

test('mutations are not coalesced', async () => {
  let calls = 0;
  const request = lib.createAuthenticatedRequester(client(), async () => {
    calls++;
    return response(200);
  });
  await Promise.all([request('/save', { method: 'POST' }), request('/save', { method: 'POST' })]);
  assert.equal(calls, 2);
});

test('multipart uploads let fetch supply the boundary and retain authentication', async () => {
  const form = new FormData(); form.append('files', new Blob(['test'], {type: 'application/pdf'}), 'remito.pdf');
  const request = lib.createAuthenticatedRequester(client(), async (_, options) => {
    assert.equal(options.body, form);
    assert.equal(options.headers.has('Content-Type'), false);
    assert.equal(options.headers.get('Authorization'), 'Bearer old');
    return response(200);
  });
  await request('/files', {method: 'POST', body: form});
});
