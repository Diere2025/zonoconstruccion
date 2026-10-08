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

async function callList(role, date, options = {}) {
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
          if (method === 'then') return resolve => {
            const select = calls.findLast(c => c[0] === 'select')?.[1];
            const range = calls.find(c => c[0] === 'range');
            const limit = calls.find(c => c[0] === 'limit')?.[1];
            const rows = options.rows || [];
            const data = table === 'mp_accounts' ? [] : range ? rows.slice(range[1], range[2] + 1) : rows.slice(0, limit);
            resolve({ data, error: select === 'amount, id' && options.statsError ? { message: 'Stats unavailable' } : null });
          };
          if (method === 'maybeSingle') return async () => ({ data: table === 'sellers' ? { role, roles: [] } : options.payment || null });
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
    exports, process, console: { ...console, error() {} }, URL,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
      if (name === '@supabase/supabase-js') return { createClient: () => client };
      if (name === '@/lib/mpPaymentDate') return { getMPPaymentDayBounds };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const params = new URLSearchParams({ dateRange: 'SPECIFIC_DATE', date, ...options.filters });
  const response = await exports[options.method || 'GET'](new Request(`https://example.com/api/admin/cobros-mp-data?${params}`, {
    method: options.method || 'GET',
    ...(options.method === 'POST' ? { body: JSON.stringify(options.body || { paymentId: 'payment-1', orderCode: 'JS1' }) } : {}),
    headers: { authorization: 'Bearer test' },
  }));
  return { response, queries, calls: queries.find(q => q.table === 'mp_payments')?.calls };
}

test('API queries the requested day for administration', async () => {
  const { response, calls } = await callList('administracion', '2026-09-29');
  assert.equal(response.status, 200);
  assert.equal(response.body.effectiveRange, 'SPECIFIC_DATE');
  assert.ok(calls.some(c => c[0] === 'gte' && c[1] === 'received_at' && c[2] === '2026-09-29T03:00:00.000Z'));
  assert.ok(calls.some(c => c[0] === 'lt' && c[1] === 'received_at' && c[2] === '2026-09-30T03:00:00.000Z'));
});

test('sellers can only query today, even with historical or forged role filters', async () => {
  for (const dateRange of ['ALL', 'SPECIFIC_DATE', 'YESTERDAY', 'LAST_3_DAYS', 'LAST_15_MIN', 'TODAY']) {
    const { response, queries } = await callList('seller', '2020-01-01', {
      filters: { dateRange, role: 'admin', showHidden: 'true' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.effectiveRole, 'seller');
    assert.equal(response.body.effectiveRange, 'TODAY');
    const day = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    for (const { calls } of queries.filter(q => q.table === 'mp_payments')) {
      assert.ok(calls.some(c => c[0] === 'gte' && c[1] === 'received_at' && c[2] === `${day}T03:00:00.000Z`));
      assert.ok(calls.some(c => ['lt', 'lte'].includes(c[0]) && c[1] === 'received_at'));
      assert.ok(calls.some(c => c[0] === 'or' && c[1] === 'is_internal.is.null,is_internal.eq.false'));
      assert.ok(calls.some(c => c[0] === 'or' && c[1] === 'is_hidden.is.null,is_hidden.eq.false'));
    }
  }
});

test('sellers cannot manage accounts or internal payers, or change historical payments', async () => {
  for (const action of ['internal-payers', 'fleteros']) {
    assert.equal((await callList('seller', '', { filters: { action } })).response.status, 403);
  }
  for (const action of ['delete-payment', 'toggle-hide', 'save-account', 'simulate', 'clear-all', 'toggle-internal-payer', 'fletero-confirm', 'link-order', 'unlink-order']) {
    const { response } = await callList('seller', '', { method: 'POST', filters: { action }, body: { paymentId: 'historical', orderCode: 'JS1', userRole: 'admin' } });
    assert.equal(response.status, 403, action);
  }
});

test('sellers can link and unlink visible payments today with server date guards', async () => {
  for (const action of ['link-order', 'unlink-order']) {
    const { response, queries } = await callList('seller', '', {
      method: 'POST', filters: { action }, payment: { id: 'payment-1' },
    });
    assert.equal(response.status, 200, action);
    const scope = queries.find(q => q.table === 'mp_payments').calls;
    assert.ok(scope.some(c => c[0] === 'gte' && c[1] === 'received_at'));
    assert.ok(scope.some(c => c[0] === 'lt' && c[1] === 'received_at'));
    assert.ok(scope.some(c => c[0] === 'or' && c[1] === 'is_hidden.is.null,is_hidden.eq.false'));
  }
});

test('seller account list returns only display fields', async () => {
  const { response, queries } = await callList('seller', '', { filters: { action: 'accounts' } });
  assert.equal(response.status, 200);
  const selection = queries.find(q => q.table === 'mp_accounts').calls.find(c => c[0] === 'select')[1];
  assert.equal(selection, 'id, name, alias, color, is_active');
});

test('totals and list apply identical filters, including hidden and internal payments', async () => {
  for (const dateRange of ['TODAY', 'YESTERDAY', 'LAST_3_DAYS', 'LAST_7_DAYS', 'ALL', 'SPECIFIC_DATE']) {
    const { response, queries } = await callList('admin', '2026-09-26', {
      filters: { dateRange, accountId: 'cobroszono', type: 'TRANSFERENCIA', linkedStatus: 'LINKED', fleteroFilter: 'WITH_FLETERO', search: 'JS25645', showHidden: 'true', hideInternal: 'true' },
      rows: [{ amount: 37000 }, { amount: '179100' }],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.filteredStats.totalCount, 2);
    assert.equal(response.body.filteredStats.totalAmount, 216100);
    const paymentQueries = queries.filter(q => q.table === 'mp_payments');
    const filters = calls => calls.filter(c => !['select', 'order', 'limit', 'range'].includes(c[0]));
    assert.deepEqual(filters(paymentQueries[0].calls), filters(paymentQueries[1].calls));
  }
});

test('historical totals include every page beyond the visible 300 payments', async () => {
  const rows = Array.from({ length: 1205 }, (_, id) => ({ id: String(id), amount: 10 }));
  const { response, queries } = await callList('admin', '', { filters: { dateRange: 'ALL' }, rows });
  assert.equal(response.body.data.length, 300);
  assert.equal(response.body.filteredStats.totalCount, 1205);
  assert.equal(response.body.filteredStats.totalAmount, 12050);
  assert.equal(queries.filter(q => q.calls.some(c => c[0] === 'range')).length, 2);
});

test('empty filters return zero and statistics errors do not return a misleading amount', async () => {
  const empty = await callList('admin', '2026-09-26');
  assert.equal(empty.response.body.filteredStats.totalCount, 0);
  assert.equal(empty.response.body.filteredStats.totalAmount, 0);
  const failed = await callList('admin', '2026-09-26', { statsError: true });
  assert.equal(failed.response.status, 500);
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
