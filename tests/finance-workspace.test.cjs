const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspace } = require('./helpers/finance-workspace.cjs');

test('movement overflow uses measured available width and reserves space for its menu', () => {
  const fs = require('node:fs');
  const ts = require('typescript');
  const vm = require('node:vm');
  const source = fs.readFileSync('src/components/finanzas/FinanceToolbar.tsx', 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => name === '@/lib/financialAccountLabels' ? { financialAccountLabel: value => value } : require(name)
  });
  const widths = [150, 120, 160, 140, 130, 160, 140];
  for (const [available, expected] of [[900, 3], [899, 2], [880, 2], [879, 1], [742, 1], [741, 0], [300, 0]]) {
    assert.equal(exports.visibleMovementCount(available, widths), expected);
  }
});

test('category uses a searchable list and preserves linked-order reset behavior', () => {
  const app = workspace({ isTxModalOpen: true, txCategory: 'Recaudación', linkToOrder: true, selectedOrderId: 'order' });
  const picker = app.find(element => element.props?.id === 'tx-category');
  assert.equal(picker.props.label, 'Categoría');
  assert.equal(picker.props.clearOnSearch, false);
  assert.ok(picker.props.options.some(option => option.value === 'Gastos Operativos'));
  picker.props.onChange('Gastos Operativos');
  assert.equal(app.state.get('txCategory'), 'Gastos Operativos');
  assert.equal(app.state.get('linkToOrder'), false);
  assert.equal(app.state.get('selectedOrderId'), '');
  assert.ok(app.markup().includes('role="combobox"'));
});

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
test('transfer shortcut resets details and selects distinct accounts of the same currency', () => {
  const app = workspace({ tfSourceId: 'cash', tfDestId: 'bank', tfAmount: '100', tfConcept: 'old transfer', tfNotes: 'old notes' });
  app.toolbar().onTransfer();
  assert.equal(app.state.get('tfSourceId'), 'cash');
  assert.equal(app.state.get('tfDestId'), 'bank');
  for (const name of ['tfAmount','tfConcept','tfNotes']) assert.equal(app.state.get(name), '');
  assert.equal(app.state.get('isTransferModalOpen'), true);
  assert.equal(app.writes(), 0);
});

test('transfer opens with the reviewed MP2 to MP1 defaults every time', () => {
  const { accounts } = require('./helpers/finance-workspace.cjs');
  const app = workspace({ financialAccounts: [
    accounts[2], ...accounts.slice(0, 2),
    { id: 'mp1', name: 'Cuenta MP1', currency: 'ARS', is_active: true },
    { id: 'mp2', name: 'Cuenta MP2', currency: 'ARS', is_active: true }
  ] });
  app.toolbar().onTransfer();
  assert.equal(app.state.get('tfSourceId'), 'mp2');
  assert.equal(app.state.get('tfDestId'), 'mp1');
  app.state.set('tfSourceId', 'cash'); app.state.set('tfDestId', 'bank');
  app.render(); app.toolbar().onTransfer();
  assert.equal(app.state.get('tfSourceId'), 'mp2');
  assert.equal(app.state.get('tfDestId'), 'mp1');
  app.render();
  const destination = app.find(el => el.type === 'select' && el.props.value === 'mp1');
  const options = destination.props.children.flat().filter(el => el?.type === 'option').map(el => el.props.value);
  assert.ok(!options.includes('mp2'));
  assert.ok(!options.includes('usd'));
  assert.equal(app.writes(), 0);
});

test('transfer leaves destination empty when there is no compatible active account', () => {
  const app = workspace({ financialAccounts: [
    { id: 'mp2', name: 'Cuenta MP2', currency: 'ARS', is_active: true },
    { id: 'mp1', name: 'Cuenta MP1', currency: 'ARS', is_active: false },
    { id: 'usd', name: 'Caja Dólares', currency: 'USD', is_active: true }
  ] });
  app.toolbar().onTransfer();
  assert.equal(app.state.get('tfSourceId'), 'mp2');
  assert.equal(app.state.get('tfDestId'), '');
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
