const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, document: { body: {} }, require: name => dependencies[name] || require(name) });
  return exports;
}
const plans = load('src/lib/cuotaSimple.ts');
const Selector = load('src/components/vendedores/PaymentMethodSelector.tsx', { '@/lib/cuotaSimple': plans }).default;
const methods = plans.CUOTA_SIMPLE_PAYMENT_PLANS.map(plan => ({ ...plan, id: `plan-${plan.installments}` }));
const cash = { id: 'cash', name: 'Contado', surcharge_percentage: 0, installments: 1 };
function elements(element) {
  if (!element || typeof element !== 'object') return [];
  return [element, ...[element.props?.children].flat(Infinity).flatMap(elements)];
}

test('current Posnet plans have the requested rates and installment parsing', () => {
  assert.deepEqual(Array.from(methods, m => m.surcharge_percentage), [25, 43]);
  for (const method of methods) {
    assert.equal(plans.cuotaSimpleInstallments(method.name), method.installments);
    assert.equal(plans.isRetiredPaymentMethod(method.name), false);
  }
});

test('one Posnet option defaults to six and buttons select each stored plan ID', () => {
  let chosen;
  const props = { methods: [cash, ...methods], value: 'cash', onChange: id => { chosen = id; } };
  const initial = elements(Selector(props));
  const options = initial.filter(e => e.type === 'option');
  assert.equal(options.length, 2);
  assert.equal(options[1].props.children, 'Posnet · hasta 6 cuotas');
  initial.find(e => e.type === 'select').props.onChange({ target: { value: 'cuota-simple' } });
  assert.equal(chosen, 'plan-6');
  for (const method of methods) {
    const rendered = elements(Selector({ ...props, value: method.id }));
    assert.equal(rendered.find(e => e.type === 'select').props.value, 'cuota-simple');
    const buttons = rendered.filter(e => e.type === 'button');
    assert.equal(buttons.length, 2);
    assert.equal(buttons.filter(e => e.props['aria-pressed']).length, 1);
    for (const [index, button] of buttons.entries()) {
      button.props.onClick();
      assert.equal(chosen, methods[index].id);
    }
  }
});

test('missing plans are disabled and retired payment IDs are preserved', () => {
  const partial = elements(Selector({ methods: [cash, methods[1]], value: 'plan-6', onChange: () => {} }));
  assert.equal(partial.filter(e => e.type === 'button' && e.props.disabled).length, 1);
  const retired = elements(Selector({ methods: [cash], value: 'old-id', onChange: () => {} }));
  assert.equal(retired.find(e => e.type === 'select').props.value, 'old-id');
  assert.ok(retired.find(e => e.type === 'option' && e.props.value === 'old-id' && e.props.disabled));
});

test('current installment orders select their delivery note column without compounding', () => {
  const print = load('src/lib/logisticsPrintOrders.ts');
  const notes = load('src/lib/logisticsOrderNotes.ts', { './cuotaSimple': plans, './logisticsPrintOrders': print });
  for (const method of methods) {
    const pendingBalance = Math.round(100000 * (1 + method.surcharge_percentage / 100));
    for (const surcharge of [0, pendingBalance - 100000]) {
      const order = { paymentMethod: method.name, productsSubtotal: 100000, pendingBalance, surcharge };
      assert.equal(notes.orderNoteBaseAmount(order, notes.DEFAULT_ORDER_NOTE_RATES), 100000);
      assert.deepEqual(Array.from(notes.orderNoteCardAmounts(order, notes.DEFAULT_ORDER_NOTE_RATES)), [125000, 143000]);
    }
  }
});

test('printed delivery table has two installment headers and ten cells per order', () => {
  const print = load('src/lib/logisticsPrintOrders.ts');
  const notes = load('src/lib/logisticsOrderNotes.ts', { './cuotaSimple': plans, './logisticsPrintOrders': print });
  const { PrintableOrderNotes } = load('src/components/logistica/LogisticsOrderNotesPanel.tsx', {
    '@/lib/cuotaSimple': plans,
    '@/lib/logisticsOrderNotes': notes,
    'react-dom': { createPortal: content => content }
  });
  const values = Array(84).fill('');
  values[1] = 'JS123';
  values[2] = '01/07/2026';
  const order = { ...print.parseLogisticsPrintRows([values])[0], paymentMethod: 'Posnet x6 (Nov26)', productsSubtotal: 100000, pendingBalance: 240000, surcharge: 140000 };
  const element = PrintableOrderNotes({ orders: [order], settings: { posnetRates: Array.from(notes.DEFAULT_ORDER_NOTE_RATES), changeAmount: '' } });
  const tree = elements(element);
  const headings = tree.filter(e => e.type === 'th' && e.props.className === 'order-note-installment' && e.key !== null);
  assert.deepEqual(headings.map(e => e.props.children[0].props.children[0]), [3, 6]);
  assert.equal(tree.find(e => e.props.className === 'order-note-cuota-heading').props.colSpan, 3);
  assert.equal(tree.filter(e => e.type === 'col').length, 10);
  assert.equal(tree.filter(e => e.type === 'td').length, 10);
  const selected = tree.find(e => e.type === 'td' && e.props.className?.includes('order-note-selected-option'));
  assert.ok(selected);
  const html = require('react-dom/server').renderToStaticMarkup(element);
  assert.ok(html.includes('240.000'));
  assert.ok(html.includes('43%'));
  assert.equal(notes.selectedOrderNoteCardIndex(order.paymentMethod), 1);
  const paidElement = PrintableOrderNotes({ orders: [{ ...order, pendingBalance: 0, paidAmount: 240000, orderTotal: 240000 }], settings: { posnetRates: Array.from(notes.DEFAULT_ORDER_NOTE_RATES), changeAmount: '' } });
  const paidTree = elements(paidElement);
  const paymentCell = paidTree.find(e => e.props.className === 'order-note-payment-status');
  assert.equal(paymentCell.props.children, 'Pedido pago');
  assert.equal(paymentCell.props.colSpan, 4);
  assert.equal(paidTree.filter(e => e.type === 'td' && e.props.className?.includes('order-note-posnet')).length, 0);
  const unknownElement = PrintableOrderNotes({ orders: [{ ...order, pendingBalance: 0, paidAmount: 0, paymentStatus: 'No Abonado' }], settings: { posnetRates: Array.from(notes.DEFAULT_ORDER_NOTE_RATES), changeAmount: '' } });
  assert.equal(elements(unknownElement).find(e => e.props.className === 'order-note-payment-status').props.children, 'Saldo $0 · verificar');
  const legacyElement = PrintableOrderNotes({ orders: [{ ...order, paymentMethod: 'Payway3 (Sept-26)', productsSubtotal: 229000, pendingBalance: 302280, surcharge: 73280 }], settings: { posnetRates: Array.from(notes.DEFAULT_ORDER_NOTE_RATES), changeAmount: '' } });
  const legacyHtml = require('react-dom/server').renderToStaticMarkup(legacyElement);
  assert.ok(legacyHtml.includes('Plan anterior · 3c *'));
  assert.ok(legacyHtml.includes('302.280'));
  assert.equal(elements(legacyElement).find(e => e.type === 'td' && e.props.className?.includes('order-note-selected-option')).props.title, 'Importe pactado con Payway3 (Sept-26)');
});
