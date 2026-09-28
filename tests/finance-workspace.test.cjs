const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspace } = require('./helpers/finance-workspace.cjs');

test('quick movements clear stale edits, amounts and purchase/order/employee links', () => {
  const app = workspace({ editingTx: { id: 'old' }, duplicatingTx: true, txAmount: '123', txNotes: 'old notes', txEfeCategory: 'old accounting', selectedEmployeeId: 'old employee', selectedSupplierId: 'old supplier', selectedPurchaseId: 'old purchase', selectedOrderId: 'old order', linkToOrder: true, linkToPurchase: true, txRouteSheetId: 'old sheet', txCostCenterId: 'old unit', txAccountId: 'usd' });
  app.toolbar().onNew('eventuales');
  assert.equal(app.state.get('txCategory'), 'Sueldos');
  assert.equal(app.state.get('txSubCategory'), 'Sueldos Eventuales');
  assert.equal(app.state.get('txType'), 'egreso');
  assert.equal(app.state.get('txCreatedAt'), '2026-09-28');
  assert.equal(app.state.get('txAccountId'), 'cash');
  for (const name of ['txAmount','txNotes','txEfeCategory','selectedEmployeeId','selectedSupplierId','selectedPurchaseId','selectedOrderId','txRouteSheetId','txCostCenterId']) assert.equal(app.state.get(name), '', name);
  for (const name of ['duplicatingTx','linkToOrder','linkToPurchase']) assert.equal(app.state.get(name), false, name);
  assert.equal(app.state.get('editingTx'), null);
  assert.equal(app.writes(), 0);
  app.render();
  app.toolbar().onNew('proveedor');
  assert.equal(app.state.get('linkToPurchase'), true);
  app.render(); app.toolbar().onNew('general');
  assert.equal(app.state.get('linkToPurchase'), false);
  assert.equal(app.state.get('txCategory'), 'Gastos Operativos');
  assert.equal(app.state.get('txSubCategory'), '');
});
test('preset accounting classification comes only from an unambiguous active catalog match', () => {
  const concept = { id: 'eventual', concept: 'Jornales', category: 'Sueldos', sub_category: 'Sueldos Eventuales', efe_category: 'Personal Eventual', movement_type: 'Egreso', is_active: true };
  const app = workspace({ financialConcepts: [concept] });
  app.toolbar().onNew('eventuales');
  assert.equal(app.state.get('txFinancialConceptId'), 'eventual');
  assert.equal(app.state.get('txEfeCategory'), 'Personal Eventual');
  const ambiguous = workspace({ financialConcepts: [concept, { ...concept, id: 'other', concept: 'Otros jornales' }] });
  ambiguous.toolbar().onNew('eventuales');
  assert.equal(ambiguous.state.get('txFinancialConceptId'), null);
  assert.equal(ambiguous.state.get('txEfeCategory'), '');
});
test('transfer shortcut resets all fields and opens a form without creating transactions', () => {
  const app = workspace({ tfSourceId: 'cash', tfDestId: 'bank', tfAmount: '100', tfConcept: 'old transfer', tfNotes: 'old notes' });
  app.toolbar().onTransfer();
  for (const name of ['tfSourceId','tfDestId','tfAmount','tfConcept','tfNotes']) assert.equal(app.state.get(name), '');
  assert.equal(app.state.get('isTransferModalOpen'), true);
  assert.equal(app.writes(), 0);
});
test('filters reset pagination and clear restores the default range', () => {
  const app = workspace({ currentPage: 3, filterCategory: 'Sueldos', filterCostCenterId: 'unit' });
  app.toolbar().onSearch('herramientas');
  assert.equal(app.state.get('currentPage'), 1);
  app.render(); app.toolbar().onClear();
  assert.equal(app.state.get('searchTerm'), '');
  assert.equal(app.state.get('filterCategory'), 'all');
  assert.equal(app.state.get('filterCostCenterId'), 'all');
  assert.equal(app.state.get('presetRange'), '30dias');
});
test('compact defaults show 50 rows with optional fields accessible through details', () => {
  const app = workspace();
  let html = app.markup();
  assert.equal((html.match(/aria-label="Ver detalle de/g) || []).length, 50);
  assert.ok(!html.includes('Totalizadores Pesos'));
  assert.ok(!html.includes('>Subcategoría</th>'));
  const expand = app.find(el => el.props?.['aria-label'] === 'Ver detalle de Cobro venta directa');
  expand.props.onClick();
  html = app.markup();
  assert.ok(html.includes('Observación de ejemplo para verificar detalle'));
  app.toolbar().onColumn('subcategory');
  html = app.markup();
  assert.ok(html.includes('>Subcategoría</th>'));
  assert.ok(html.includes('colSpan="9"'));
});

test('direct section URLs select the appropriate workspace without an internal tab bar', () => {
  for (const [query, title] of [['', 'Movimientos'], ['tab=accounts', 'Cuentas y saldos'], ['tab=cc', 'Cuentas corrientes'], ['tab=validations', 'Comprobantes a validar']]) {
    const html = workspace({}, query).markup();
    assert.ok(html.includes(`>${title}</h1>`), query);
    assert.ok(!html.includes('Estado de Resultados'));
    assert.ok(!html.includes('>Flujo General</button>'));
  }
});

test('changing provider clears a previous invoice and the cost center remains optional', () => {
  const app = workspace({ isTxModalOpen: true, txCategory: 'Proveedores', linkToPurchase: true, suppliers: [{ id: 's1', name: 'Proveedor Uno' }, { id: 's2', name: 'Proveedor Dos' }], selectedSupplierId: 's1', selectedPurchaseId: 'p1' });
  const picker = app.find(element => element.props?.id === 'tx-supplier');
  picker.props.onChange('s2');
  assert.equal(app.state.get('selectedSupplierId'), 's2');
  assert.equal(app.state.get('selectedPurchaseId'), '');
  app.render();
  const area = app.find(element => element.props?.id === 'tx-cost-center');
  assert.ok(!area.props.required);
  const html = app.markup();
  assert.ok(html.includes('Efectivo Pesos (ARS)'));
  assert.ok(!html.includes('Caja Efectivo Pesos (ARS)'));
  assert.ok(html.indexOf('Fecha del movimiento') < html.indexOf('Buscar concepto (opcional)'));
  assert.equal(app.writes(), 0);
});
