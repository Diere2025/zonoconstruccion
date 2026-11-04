const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, URL, Date, process: { env: {} }, console });
  return exports;
}
const warnings = load('src/lib/mpOrderLinkWarnings.ts');

function fixture({ order = null, lookupError = null, existing = null } = {}) {
  const writes = [], filters = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'user', email: '' } } }) },
    from(table) {
      let value;
      const q = {
        select() { return q; },
        eq(...args) { filters.push([table, 'eq', ...args]); return q; },
        ilike(...args) { filters.push([table, 'ilike', ...args]); return q; },
        update(row) { value = row; writes.push(row); return q; },
        maybeSingle() { return q; }, single() { return q; },
        then(resolve, reject) {
          const data = table === 'sellers' ? { role: 'logistica' }
            : table === 'orders' ? order
            : value ? { id: 'payment', ...value } : existing;
          return Promise.resolve({ data, error: table === 'orders' ? lookupError : null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const route = load('src/app/api/admin/cobros-mp-data/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/mpPaymentDate': {}, '@/lib/mpAccountIncomeServer': {},
    '@/lib/mpOrderLinkWarnings': warnings,
  });
  const send = body => route.POST(new Request('https://example.invalid/api/admin/cobros-mp-data?action=link-order', {
    method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify({ paymentId: 'payment', linkedBy: 'Logística', ...body }),
  }));
  return { send, writes, filters };
}

test('phone warns about format and existence before writing; confirmation still allows it', async () => {
  const f = fixture();
  const first = await f.send({ orderCode: '1131435323' });
  assert.equal(first.body.requiresConfirmation, true);
  assert.equal(first.body.warnings.length, 2);
  assert.equal(f.writes.length, 0);
  const saved = await f.send({ orderCode: '1131435323', confirmedWarningCode: '1131435323' });
  assert.equal(saved.body.success, true);
  assert.equal(f.writes[0].order_code, '1131435323');
  assert.equal(f.writes[0].order_id, null);
});

test('unknown valid code only warns about ERP existence and can be saved', async () => {
  const f = fixture();
  const result = await f.send({ orderCode: ' js24940 ' });
  assert.equal(result.body.warnings.length, 1);
  assert.match(result.body.warnings[0], /no se encuentra en el ERP/);
  assert.equal(f.writes.length, 0);
  const saved = await f.send({ orderCode: 'js24940', confirmedWarningCode: 'JS24940' });
  assert.equal(saved.body.payment.order_code, 'JS24940');
});

test('existing codes, including hyphenated codes, link without a warning', async () => {
  for (const code of ['JS24940', 'LK01591', 'DB0666', 'AQ-FP123', 'MJS123']) {
    const f = fixture({ order: { id: 'order', legacy_code: code } });
    const result = await f.send({ orderCode: code.toLowerCase() });
    assert.equal(result.body.success, true);
    assert.equal(result.body.payment.order_id, 'order');
  }
});

test('lookup failure warns that verification failed rather than claiming the order is missing', async () => {
  const f = fixture({ lookupError: { message: 'offline' } });
  const result = await f.send({ orderCode: 'JS24940' });
  assert.equal(result.body.warnings.length, 1);
  assert.match(result.body.warnings[0], /No se pudo verificar/);
  assert.equal(f.writes.length, 0);
});

test('free text wildcards are escaped and a confirmation for another code does not bypass the warning', async () => {
  const f = fixture();
  const result = await f.send({ orderCode: 'tel_%', confirmedWarningCode: 'JS24940' });
  assert.equal(result.body.requiresConfirmation, true);
  assert.equal(f.writes.length, 0);
  assert.ok(f.filters.some(row => row[1] === 'ilike' && row[3] === 'TEL\\_\\%'));
});

test('selected orders are verified and conflict handling remains in place after confirmation', async () => {
  const f = fixture({ order: { id: 'order', legacy_code: 'JS24940' } });
  assert.equal((await f.send({ orderCode: 'JS24940', orderId: 'order' })).body.success, true);
  assert.ok(f.filters.some(row => row[0] === 'orders' && row[2] === 'id' && row[3] === 'order'));
  const conflict = fixture({ existing: { order_code: 'DB0666', linked_by: 'Ventas' } });
  const result = await conflict.send({ orderCode: '1131435323', confirmedWarningCode: '1131435323' });
  assert.equal(result.body.payment.order_code, 'DB0666 / 1131435323');
});

test('UI cancellation leaves payment untouched; accepting warnings retries and updates the payment', async () => {
  const page = fs.readFileSync('src/app/admin/cobros-mp/page.tsx', 'utf8');
  const handler = page.slice(page.indexOf('  const handleLinkOrder ='), page.indexOf('  // Unlink Order'));
  const code = ts.transpileModule(handler + '\nglobalThis.run = handleLinkOrder;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const accepted of [false, true]) {
    const calls = [], saving = [];
    let updated = false, closed = false;
    const context = {
      linkingPayment: { id: 'payment' }, manualOrderCode: '1131435323',
      currentUserName: 'Logística', currentUserRole: 'logistica',
      setIsSavingLink: value => saving.push(value),
      confirm: message => { assert.match(message, /¿Querés vincular/); return accepted; },
      alert: message => assert.fail(message), console,
      fetchCobrosData: async (_, options) => {
        calls.push(JSON.parse(options.body));
        return { json: async () => calls.length === 1
          ? { requiresConfirmation: true, warnings: ['Formato no reconocido'] }
          : { success: true, payment: { id: 'payment' } } };
      },
      setPayments: () => { updated = true; }, setLinkingPayment: () => { closed = true; },
    };
    vm.runInNewContext(code, context);
    await context.run();
    assert.equal(calls.length, accepted ? 2 : 1);
    assert.equal(updated, accepted);
    assert.equal(closed, accepted);
    assert.deepEqual(saving, [true, false]);
    if (accepted) assert.equal(calls[1].confirmedWarningCode, '1131435323');
  }
});
