const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}, expose = '') {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText + expose, { exports, process, require: name => imports[name] || {} });
  return exports;
}

test('a payroll withdrawal does not block generating a mixed delivery settlement', async () => {
  const date = '2026-11-13';
  const carrier = { id: '952479c3-7a9f-4692-8e19-43bca146c2c8', name: 'Jorge Salcedo', is_active: true };
  const regular = { id: 'regular', legacy_code: 'JS26895', employee_withdrawal: false };
  const withdrawal = { id: 'withdrawal', legacy_code: 'RMRH00155', employee_withdrawal: true };
  const dispatch = { id: 'dispatch', code: 'LOG_REC_05574', carrier_name: carrier.name, delivery_date: date };
  const employeeDelivery = { id: 'employee-delivery', order_id: withdrawal.id, route_sheet_id: 'route', status: 'entregado', orders: withdrawal };
  const tables = {
    carriers: [carrier], orders: [regular, withdrawal],
    deliveries: [employeeDelivery], treasury_settlements: [],
    route_sheets: [{ id: 'route', carrier_id: carrier.id, delivery_date: date, run_number: 1 }],
    logistics_dispatches: [dispatch], logistics_dispatch_routes: [],
    logistics_dispatch_settlements: [], logistics_dispatch_attempts: [],
  };
  let nextId = 0;
  const db = {
    from(table) {
      const rows = tables[table];
      const filters = [];
      let written;
      const read = () => ({ data: (written || rows).filter(row => filters.every(match => match(row))), error: null });
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push(row => row[key] === value); return query; },
        neq: (key, value) => { filters.push(row => row[key] !== value); return query; },
        in: (key, values) => { filters.push(row => values.includes(row[key])); return query; },
        maybeSingle: async () => ({ data: read().data[0] || null, error: null }),
        single: async () => ({ data: read().data[0], error: null }),
        then: resolve => resolve(read()),
        insert(payload) {
          assert.notEqual(payload.order_id, withdrawal.id);
          written = [{ id: String(++nextId), ...payload }];
          if (table === 'deliveries') written[0].orders = regular;
          rows.push(...written);
          return query;
        },
        update(payload) {
          const result = read();
          for (const row of result.data) {
            assert.notEqual(row.order_id, withdrawal.id);
            Object.assign(row, payload);
          }
          return query;
        },
        upsert(payload) {
          rows.push(...(Array.isArray(payload) ? payload : [payload]));
          return query;
        },
      };
      return query;
    },
  };
  // The withdrawal is the only row with a LOG code in this rendition.
  const toRow = (order, amount, stop, payment, dispatchCode) => {
    const row = Array(93).fill('');
    Object.assign(row, { 0: order.legacy_code, 1: '13/11/2026', 14: stop, 15: 'Entregado',
      20: payment, 28: amount, 79: carrier.name, 92: dispatchCode });
    return row;
  };
  const sheet = [toRow(regular, 245000, 17, 'Contado', ''), toRow(withdrawal, 151050, 18, 'Descuento Sueldo', dispatch.code)];
  const identity = load('src/lib/carrierIdentity.ts');
  const api = load('src/app/api/admin/rendiciones/route.ts', {
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/carrierIdentity': identity,
    '@/lib/googleSheets': { fetchSpreadsheetValues: async () => sheet },
    '@/lib/logisticsDispatch/identityCorrectionServer': { projectCorrectedDeliveredRows: async (_, rows) => rows },
    '@/lib/logisticsDispatch/references': { settlementDispatchReferences: async (_, rows) => rows },
    '@/lib/logisticsDispatch/settlementIdentity': load('src/lib/logisticsDispatch/settlementIdentity.ts', { '@/lib/carrierIdentity': identity }),
    '@/lib/logisticsDispatch/settlementRoute': load('src/lib/logisticsDispatch/settlementRoute.ts'),
    '@/lib/logisticsDispatch/settlementSource': load('src/lib/logisticsDispatch/settlementSource.ts'),
    '@/lib/orderSync': load('src/lib/orderSync.ts'),
    '@/lib/settlementOrders': load('src/lib/settlementOrders.ts'),
  }, ';Object.assign(exports, { getEntregandoPreview, confirmEntregandoItems });');

  const [preview] = await api.getEntregandoPreview('entregados', date);
  assert.equal(preview.dispatchCode, dispatch.code);
  assert.equal(preview.orders.length, 1);
  assert.equal(preview.orders[0].orderCode, regular.legacy_code);
  assert.equal(preview.totalAmount, 245000);
  // A browser tab opened before refreshing can still submit the original rows.
  const result = await api.confirmEntregandoItems({ id: 'laura' }, [{
    ...preview, orders: [...preview.orders, { orderCode: withdrawal.legacy_code, deliveryStatus: 'Entregado' }],
  }]);
  assert.equal(result.created, 1);
  assert.equal(tables.treasury_settlements[0].deliveries_total, 245000);
  assert.equal(tables.route_sheets[0].total_theoretical_cash, 245000);
  assert.equal(tables.deliveries[0], employeeDelivery);
  assert.equal(tables.deliveries[1].order_id, regular.id);

  sheet.shift();
  assert.equal((await api.getEntregandoPreview('entregados', date)).length, 0);
});
