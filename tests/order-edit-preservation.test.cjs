const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/app/vendedores/pedidos/page.tsx', 'utf8');
const ast = ts.createSourceFile('orders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    effects.push(node.arguments[0].getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function runEffect(marker, context) {
  const effect = effects.find(text => text.includes(marker));
  assert.ok(effect, `Missing effect: ${marker}`);
  return vm.runInNewContext(ts.transpileModule(`(${effect})()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function clientForm({ editing = false, wholesale = false } = {}) {
  const changes = {};
  const pending = {};
  const context = {
    selectedClientId: 'client',
    clients: [{ id: 'client', business_name: 'Actual client', phone_primary: '123', tax_id: '' }],
    isEditingRef: { current: false },
    editingOrderIdRef: { current: editing ? 'order' : null },
    manualAddressClientIdRef: { current: '' },
    lastRetailAutofillClientIdRef: { current: '' },
    isAnabelSeller: false, isWholesaleContext: wholesale, sourceQuoteId: null,
    localities: [{ id: 'city', name: 'Quilmes' }],
    supabase: {
      from(table) {
        const promise = new Promise(resolve => { pending[table] = resolve; });
        const query = { then: promise.then.bind(promise) };
        for (const method of ['select', 'eq', 'order', 'not', 'limit', 'maybeSingle']) query[method] = () => query;
        return query;
      }
    }
  };
  for (const field of ['ClientAddresses', 'AppliedWholesaleDiscountLabel', 'Cliente', 'NewClientName',
    'NewClientTaxId', 'ShowTaxIdField', 'NewClientPhones', 'OrderDiscountType', 'OrderDiscountValue',
    'WhaticketLink', 'SelectedAddressId', 'Direccion', 'LocalidadId', 'LocalitySearch', 'LinkMaps', 'Aclaraciones']) {
    context[`set${field}`] = value => { changes[field] = value; };
  }
  return { context, pending, changes, start: () => runEffect('async function fetchAddresses()', context) };
}
const addresses = [{ id: 'home', full_address: 'Client home', locality_id: 'city' }];

test('catalog refresh during editing only loads address options, preserving the order snapshot', async () => {
  const form = clientForm({ editing: true, wholesale: true });
  form.start();
  form.pending.addresses({ data: addresses });
  await tick();
  assert.deepEqual(Object.keys(form.changes), ['ClientAddresses']);
  assert.equal(form.changes.ClientAddresses, addresses);
  assert.equal(form.pending.clients, undefined);
  assert.equal(form.pending.orders, undefined);
});

test('a client lookup started before editing cannot overwrite pickup or Whaticket afterwards', async () => {
  const form = clientForm();
  form.start();
  for (const key of Object.keys(form.changes)) delete form.changes[key];
  form.context.editingOrderIdRef.current = 'order';
  form.pending.orders({ data: [{ whaticket_link: 'another-order-link' }] });
  form.pending.addresses({ data: addresses });
  await tick();
  assert.deepEqual(Object.keys(form.changes), ['ClientAddresses']);
});

test('a discarded client request cannot apply its address or Whaticket response', async () => {
  const form = clientForm();
  const cleanup = form.start();
  for (const key of Object.keys(form.changes)) delete form.changes[key];
  cleanup();
  form.pending.orders({ data: [{ whaticket_link: 'old-link' }] });
  form.pending.addresses({ data: addresses });
  await tick();
  assert.deepEqual(form.changes, {});
});

test('a pending wholesale discount cannot overwrite the loaded order discount', async () => {
  const form = clientForm({ wholesale: true });
  form.start();
  for (const key of Object.keys(form.changes)) delete form.changes[key];
  form.context.editingOrderIdRef.current = 'order';
  form.pending.clients({ data: { default_discount_coef: 0.5 } });
  await tick();
  assert.deepEqual(form.changes, {});
});

test('new orders still autofill the client destination', async () => {
  const form = clientForm();
  form.start();
  form.pending.orders({ data: [] });
  form.pending.addresses({ data: addresses });
  await tick();
  assert.equal(form.changes.SelectedAddressId, 'home');
  assert.equal(form.changes.Direccion, 'Client home');
  assert.equal(form.changes.LocalidadId, 'city');
});

test('loading or editing never recalculates saved dates and freight, even with late localities', () => {
  for (const loading of [true, false]) {
    const context = {
      isEditingRef: { current: loading }, editingOrderIdRef: { current: loading ? null : 'order' },
      localidadId: 'city', lastAutoLocalityIdRef: { current: '' },
      setEntregaInicial: () => assert.fail('Saved initial date was replaced'),
      setEntregaMaxima: () => assert.fail('Saved maximum date was replaced'),
      setFlete: () => assert.fail('Saved freight was replaced')
    };
    runEffect('const nextDate = calculateNextDeliveryDate(', context);
    assert.equal(context.lastAutoLocalityIdRef.current, 'city');
  }
});

test('new orders still calculate delivery dates when choosing a locality', () => {
  const changes = {};
  runEffect('const nextDate = calculateNextDeliveryDate(', {
    isEditingRef: { current: false }, editingOrderIdRef: { current: null },
    localidadId: 'city', lastAutoLocalityIdRef: { current: '' }, isPickup: false, sourceVisitId: null,
    localities: [{ id: 'city', zones: { delivery_times: { name: 'Regular' } } }],
    deliveryTimes: [], fechaPedido: '2026-10-01',
    calculateNextDeliveryDate: () => '2026-10-02',
    calculateNthBusinessDay: () => '2026-10-06', formatDateInput: date => date,
    setEntregaInicial: date => { changes.initial = date; },
    setEntregaMaxima: date => { changes.max = date; },
    setFlete: value => { changes.freight = value; }
  });
  assert.deepEqual(changes, { initial: '2026-10-02', max: '2026-10-06', freight: 'Regular' });
});
