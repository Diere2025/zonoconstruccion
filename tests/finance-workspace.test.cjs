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
    exports, require: name => name === '@/lib/financialAccountLabels' ? { financialAccountLabel: value => value } : name==='@/components/ui/AdaptiveSelect'?{__esModule:true,default:()=>null}:require(name)
  });
  const widths = [150, 120, 160, 140, 130, 160, 140];
  for (const [available, expected] of [[900, 3], [899, 2], [880, 2], [879, 1], [742, 1], [741, 0], [300, 0]]) {
    assert.equal(exports.visibleMovementCount(available, widths), expected);
  }
});

test('daily shortcuts open dedicated editors without direct database writes', () => {
  const app=workspace({operationEditor:{kind:'general',transactionId:'old',duplicate:true}});
  for(const [shortcut,kind,payrollKind] of [['proveedor','supplier_payment'],['cobro','customer_collection'],['gasto','operating_expense'],['sueldo','payroll_payment'],['impuesto','tax_payment'],['eventuales','payroll_payment','temporary'],['adelanto','payroll_payment','advance']]) {
    app.toolbar().onNew(shortcut);
    const editor=app.state.get('operationEditor');
    assert.equal(editor.kind,kind);assert.equal(editor.payrollKind,payrollKind);
    assert.equal(editor.transactionId,undefined);assert.equal(editor.duplicate,undefined);
    app.render();
  }
  app.toolbar().onTransfer();assert.equal(app.state.get('operationEditor').kind,'internal_transfer');
  assert.equal(app.writes(),0);
});

test('new movement chooses a business family before opening its specific form',()=>{
 const app=workspace();app.toolbar().onNew('general');app.render();
 assert.equal(app.state.get('choosingOperation'),true);
 const chooser=app.find(el=>typeof el.props?.onChoose==='function');assert.ok(chooser);
 chooser.props.onChoose('custody_fund');assert.equal(app.state.get('choosingOperation'),false);
 assert.equal(app.state.get('operationEditor').kind,'custody_fund');assert.equal(app.writes(),0);
});
test('pending migration leaves the list visible and links to the local preview',()=>{
 const app=workspace({operationsAvailable:false});
 const html=app.markup();assert.ok(html.includes('Los movimientos existentes están disponibles para consulta'));
 assert.ok(html.includes('href="/vista-previa-movimientos"'));
 assert.ok(html.includes('Compra de elementos y herramientas'));
 assert.equal(app.toolbar().disabled,false);
 app.toolbar().onNew('proveedor');assert.equal(app.state.get('operationEditor').kind,'supplier_payment');
 app.render();assert.ok(app.find(el=>el.props?.readOnly===true && el.props.kind==='supplier_payment'));
 assert.equal(app.writes(),0);
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

