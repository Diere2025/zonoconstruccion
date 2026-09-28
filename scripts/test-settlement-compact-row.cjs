const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync('src/app/admin/rendiciones/page.tsx', 'utf8');
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let row;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'tr' && node.openingElement.getText(file).includes('order.deliveryId')) row = node.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(row, 'Must exercise the actual route-order row JSX');
const bindings = ['order','idx','darkRow','rowAccent','rowTone','excludedTone','readOnly','excluded','isPreviouslyPaid','isMixed','isFullyDigital','missingPriorTicket','orderStatus','updatingOrderStatus','toCollectAmount','cashRemainder','nonCashTotal','linkedTickets','electronicTickets','directTickets','priorReceipts','hasLinked','deliveryStatusOptions','formatPrice','safeReceiptUrl','changeRouteOrderStatus','setViewingPayment','handleAddPaymentToTickets','deleteElectronicTicket','handleOpenAssignModal','CheckCircle2','CreditCard','Trash2','AlertTriangle','Plus'];
const compiled = ts.transpileModule(`export function Render(props: any) { const {${bindings.join(',')}} = props; return <table className="whitespace-nowrap"><tbody>${row}</tbody></table>; }`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, require });
const noop = () => {};
const icon = () => React.createElement('span', { 'aria-hidden': true });
function fixture(status, payments = [], prior = false) {
  const excluded = status === 'Postergado' || status === 'Anulado';
  const tickets = payments.map(p => ({ localId: p.id, mpPaymentId: p.id, amount: p.amount, orderCode: 'TEST', paymentType: 'TRANSFERENCIA' }));
  return {
    order: { deliveryId: 'delivery', orderId: 'order', orderCode: 'TEST', customerName: 'Cliente', deliveryStatus: status, totalAmount: 300, linkedPayments: payments },
    idx: 0, darkRow: excluded, rowAccent: 'border-l-4', rowTone: status === 'Postergado' ? 'bg-blue-900 text-white' : status === 'Anulado' ? 'bg-red-900 text-white' : '',
    excludedTone: 'border-blue-200 bg-blue-50 text-blue-900',
    readOnly: true, excluded, isPreviouslyPaid: prior, isMixed: false, isFullyDigital: payments.length > 0 && !excluded, missingPriorTicket: prior && !payments.length,
    orderStatus: status, updatingOrderStatus: null, toCollectAmount: excluded || prior ? 0 : 300, cashRemainder: excluded || prior || payments.length ? 0 : 300,
    nonCashTotal: payments.reduce((sum,p) => sum+p.amount,0), linkedTickets: tickets, electronicTickets: tickets, directTickets: [], priorReceipts: [], hasLinked: payments.length > 0,
    deliveryStatusOptions: [], formatPrice: n => `$${n}`, safeReceiptUrl: u => u,
    changeRouteOrderStatus: noop, setViewingPayment: noop, handleAddPaymentToTickets: noop, deleteElectronicTicket: noop, handleOpenAssignModal: noop,
    CheckCircle2: icon, CreditCard: icon, Trash2: icon, AlertTriangle: icon, Plus: icon,
  };
}
const payments = [{ id: 'p1', amount: 120, paymentType: 'TRANSFERENCIA', payerName: 'Titular 1' }, { id: 'p2', amount: 180, paymentType: 'POINT', payerName: 'Titular 2' }];
for (const props of [fixture('Entregado'), fixture('Entregado', payments), fixture('Postergado', payments), fixture('Anulado'), fixture('Entregado', [], true)]) {
  const html = renderToStaticMarkup(React.createElement(exportsObject.Render, props));
  assert.equal([...html.matchAll(/<td\b/g)].length, 8);
  const cell = [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].at(-1)[1];
  assert.ok(!/<br|<p\b|space-y-/.test(cell), 'Tickets cannot stack into multiple lines');
  assert.ok(!html.includes('Vinculado por'));
  if (props.hasLinked) {
    assert.equal([...cell.matchAll(/>Ver<\/button>/g)].length, 2);
    assert.ok(cell.includes('$120') && cell.includes('$180'), 'Preserve both payment amounts');
  }
  if (props.darkRow) assert.ok(html.includes(props.rowTone));
  if (props.missingPriorTicket) assert.ok(html.includes('Pago previo sin ticket'));
}
assert.ok(!source.includes('xl:grid-cols-[minmax(0,1.4fr)'));
assert.ok(!source.includes('xl:sticky xl:top-3.5 xl:self-start'));
assert.ok(source.includes('Módulos de liquidación compactos'));
assert.ok(source.includes('<details key={detail.settlement.id}'));
assert.ok(!source.includes('<details key={detail.settlement.id} open'), 'Orders start collapsed');
assert.ok(source.includes('{!readOnly && <section'), 'Read-only settlements do not repeat disabled form fields');
assert.ok(source.includes('grid grid-cols-1 gap-3 lg:grid-cols-2'), 'Report and message share two columns on desktop');
assert.ok(source.includes('[&>div]:gap-3') && source.includes('[&>div>span:last-child]:shrink-0'), 'Summary labels and amounts stay separated');
console.log('OK: filas compactas, pedidos contraídos, datos sin formulario deshabilitado, resumen separado y reporte/mensaje en dos columnas.');
