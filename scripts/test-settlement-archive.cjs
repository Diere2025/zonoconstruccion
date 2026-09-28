const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { NextResponse } = require('next/server');

// Exercise the real handlers with an isolated database: never writes production.
const source = fs.readFileSync('src/app/api/admin/rendiciones/route.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText + '\nexports.preview = getEntregandoPreview;';

function fixture({ role = 'administracion', status = 'draft', rpcError = null } = {}) {
  const calls = [];
  const records = [
    { id: 'active', status: 'draft', difference: 0, settlement_date: '2026-09-28', carrier_name: 'Otro Fletero', route_detail: 'R1' },
    { id: 'old', status: 'archived', difference: 500, settlement_date: '2026-09-28', carrier_id: 'carrier', carrier_name: 'Diego Weis', route_detail: 'R1' },
  ];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'trusted-actor', email: 'test@example.com' } } }) },
    from(table) {
      let rows = table === 'sellers' ? [{ id: 'trusted-actor', role, is_active: true }]
        : table === 'carriers' ? [{ id: 'carrier', name: 'Diego Weis', is_active: true }] : records;
      const query = {
        select() { return this; },
        eq(key, value) { if (key === 'id' && table === 'treasury_settlements') rows = [{ id: value, status }]; else rows = rows.filter(row => row[key] === value); return this; },
        neq(key, value) { rows = rows.filter(row => row[key] !== value); return this; },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: { id: payload.p_settlement_id, status: 'archived' }, error: rpcError };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date, URL, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    require(name) {
      if (name === 'next/server') return { NextResponse };
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/lib/googleSheets') return { fetchSpreadsheetValues: async () => {
        const row = Array(83).fill('');
        row[0] = 'JS123'; row[1] = '28/09/2026'; row[13] = 'R1'; row[15] = 'Entregado';
        row[28] = 1000; row[79] = 'Diego Weis';
        return [row];
      } };
      if (name === '@/lib/settlementOrders') return { settlementOrdersTotal: orders => orders.reduce((sum, row) => sum + row.toCollectAmount, 0) };
      if (name.startsWith('@/lib/')) return {};
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { calls, exports };
}

const request = body => new Request('https://test/api/admin/rendiciones', {
  method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

(async () => {
  const treasury = fixture();
  const archived = await treasury.exports.POST(request({
    action: 'archive', settlementId: 'old', archiveReason: '  Cargada por error  ', actorId: 'spoofed',
  }));
  assert.equal(archived.status, 200);
  assert.equal(treasury.calls[0].name, 'archive_treasury_settlement');
  assert.equal(treasury.calls[0].payload.p_actor_id, 'trusted-actor');
  assert.equal(treasury.calls[0].payload.p_reason, 'Cargada por error');

  for (const reason of ['', '   ', 'x'.repeat(1001)]) {
    const test = fixture();
    assert.equal((await test.exports.POST(request({ action: 'archive', settlementId: 'old', archiveReason: reason }))).status, 400);
    assert.equal(test.calls.length, 0);
  }
  assert.equal((await treasury.exports.POST(request({ action: 'delete-archived', settlementId: 'old' }))).status, 403);
  assert.equal(treasury.calls.length, 1);
  const admin = fixture({ role: 'admin' });
  assert.equal((await admin.exports.POST(request({ action: 'delete-archived', settlementId: 'old' }))).status, 200);
  assert.equal(admin.calls[0].name, 'delete_archived_treasury_settlement');

  for (const action of ['save', 'confirm', 'update-delivery-status', 'generate-movements']) {
    const test = fixture({ status: 'archived' });
    assert.equal((await test.exports.POST(request({ action, settlementId: 'old' }))).status, 409);
    assert.equal(test.calls.length, 0);
  }
  const denied = fixture({ rpcError: { code: '42501', message: 'Denied' } });
  assert.equal((await denied.exports.POST(request({ action: 'archive', settlementId: 'old', archiveReason: 'Error' }))).status, 403);
  const duplicate = fixture({ rpcError: { code: '23514', message: 'Already archived' } });
  assert.equal((await duplicate.exports.POST(request({ action: 'archive', settlementId: 'old', archiveReason: 'Error' }))).status, 409);

  const headers = { authorization: 'Bearer test' };
  const active = await treasury.exports.GET(new Request('https://test/api/admin/rendiciones?action=list', { headers }));
  const activeBody = await active.json();
  assert.equal(activeBody.rows.length, 1);
  assert.equal(activeBody.rows[0].id, 'active');
  assert.equal(activeBody.stats.pending, 1);
  assert.equal(activeBody.stats.differences, 0);
  const history = await treasury.exports.GET(new Request('https://test/api/admin/rendiciones?action=list&scope=archived', { headers }));
  const historyBody = await history.json();
  assert.equal(historyBody.rows.length, 1);
  assert.equal(historyBody.rows[0].id, 'old');
  assert.equal(historyBody.stats.pending, 1);
  const preview = await treasury.exports.preview('entregados', '2026-09-28');
  assert.equal(preview.length, 1);
  assert.equal(preview[0].existingSettlementId, null, 'Debe permitir una nueva sin vincular a la archivada');
  console.log('OK: baja con motivo, permisos, actor verificado, bloqueo de cambios, archivadas y relectura sin vínculo anterior.');
})().catch(error => { console.error(error); process.exitCode = 1; });
