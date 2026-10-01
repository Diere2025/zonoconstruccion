const test = require('node:test');
const assert = require('node:assert/strict');
const { getMPPaymentDayBounds, isMPPaymentOnDay } = require('../src/lib/mpPaymentDate.ts');

test('Argentina day uses inclusive midnight and exclusive next midnight', () => {
  assert.deepEqual(getMPPaymentDayBounds('2026-09-29'), {
    startIso: '2026-09-29T03:00:00.000Z',
    endExclusiveIso: '2026-09-30T03:00:00.000Z',
  });
  assert.equal(isMPPaymentOnDay('2026-09-29T02:59:59.999Z', '2026-09-29'), false);
  assert.equal(isMPPaymentOnDay('2026-09-29T03:00:00.000Z', '2026-09-29'), true);
  assert.equal(isMPPaymentOnDay('2026-09-30T02:59:59.999999Z', '2026-09-29'), true);
  assert.equal(isMPPaymentOnDay('2026-09-30T03:00:00.000Z', '2026-09-29'), false);
});

test('bounds cross month, year and leap day correctly', () => {
  assert.equal(getMPPaymentDayBounds('2026-12-31').endExclusiveIso, '2027-01-01T03:00:00.000Z');
  assert.equal(getMPPaymentDayBounds('2028-02-29').endExclusiveIso, '2028-03-01T03:00:00.000Z');
});

test('rejects missing, malformed and impossible calendar dates', () => {
  for (const day of ['', '29/09/2026', '2026-02-29', '2026-04-31', '2026-13-01']) {
    assert.equal(getMPPaymentDayBounds(day), null);
  }
  assert.equal(isMPPaymentOnDay('invalid', '2026-09-29'), false);
});

async function callList(role, date) {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const ts = require('typescript');
  const queries = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table) {
      const calls = [];
      queries.push({ table, calls });
      const query = new Proxy({}, {
        get(_, method) {
          if (method === 'then') return resolve => resolve({ data: [], error: null });
          if (method === 'maybeSingle') return async () => ({ data: { role, roles: [] } });
          return (...args) => { calls.push([method, ...args]); return query; };
        },
      });
      return query;
    },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/app/api/admin/cobros-mp-data/route.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process, console, URL,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
      if (name === '@supabase/supabase-js') return { createClient: () => client };
      if (name === '@/lib/mpPaymentDate') return { getMPPaymentDayBounds };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const response = await exports.GET(new Request(`https://example.com/api/admin/cobros-mp-data?dateRange=SPECIFIC_DATE&date=${date}`, {
    headers: { authorization: 'Bearer test' },
  }));
  return { response, calls: queries.find(q => q.table === 'mp_payments')?.calls };
}

test('API queries the requested day for administration', async () => {
  const { response, calls } = await callList('administracion', '2026-09-29');
  assert.equal(response.status, 200);
  assert.equal(response.body.effectiveRange, 'SPECIFIC_DATE');
  assert.ok(calls.some(c => c[0] === 'gte' && c[1] === 'received_at' && c[2] === '2026-09-29T03:00:00.000Z'));
  assert.ok(calls.some(c => c[0] === 'lt' && c[1] === 'received_at' && c[2] === '2026-09-30T03:00:00.000Z'));
});

test('API rejects impossible dates before reading payments', async () => {
  const { response, calls } = await callList('admin', '2026-02-29');
  assert.equal(response.status, 400);
  assert.equal(calls, undefined);
});

test('specific date preserves logistics and carrier date restrictions', async () => {
  for (const [role, range] of [['logistica', 'LAST_3_DAYS'], ['fletero', 'LAST_15_MIN']]) {
    const { response } = await callList(role, '2020-01-01');
    assert.equal(response.status, 200);
    assert.equal(response.body.effectiveRange, range);
  }
});
