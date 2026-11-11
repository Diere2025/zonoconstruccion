const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspace } = require('./helpers/finance-workspace.cjs');

test('pending refund filter opens the existing movement to choose its order',()=>{
 const {transactions}=require('./helpers/finance-workspace.cjs');
 const refund={...transactions[1],id:'refund',concept:'Devolución pendiente',refund_order_pending:true};
 const app=workspace({transactions:[refund,transactions[0]]});
 app.toolbar().onPendingRefundOrders(true);
 assert.ok(app.markup().includes('Devolución pendiente'));
 assert.ok(!app.markup().includes(transactions[0].concept));
 app.find(el=>el.props?.title==='Abrir la devolución para asociar el pedido').props.onClick();
 assert.equal(app.state.get('operationEditor').transactionId,refund.id);
 app.toolbar().onClear();
 assert.equal(app.state.get('onlyPendingRefundOrders'),false);
});

test('cancelled originals and compensations are hidden by default and readable as disabled history', () => {
  const {transactions}=require('./helpers/finance-workspace.cjs');
  const original={...transactions[0],id:'original',concept:'Pago anulado',financial_operations:{id:'op',operation_type:'general',version:2,status:'cancelled',detail:{}}};
  const reversal={...original,id:'reversal',type:'ingreso',concept:'Reversión del pago',reversal_of_transaction_id:original.id};
  const active={...transactions[1],id:'active',concept:'Pago vigente',running_balance:123456};
  const app=workspace({transactions:[original,reversal,active]});
  let html=app.markup();
  assert.ok(html.includes('Pago vigente'));assert.ok(!html.includes('Pago anulado'));assert.ok(!html.includes('Reversión del pago'));
  assert.ok(html.includes('$123.456'));
  app.toolbar().onShowCancelled(true);html=app.markup();
  assert.ok(html.includes('Pago anulado'));assert.ok(html.includes('>Anulado</span>'));assert.ok(html.includes('>Compensación</span>'));
  const collect=(el,result=[])=>{if(!el||typeof el!=='object')return result;if(el.props?.title==='Anular movimiento')result.push(el);for(const child of require('react').Children.toArray(el.props?.children))collect(child,result);return result;};
  const buttons=collect(app.render());assert.deepEqual(buttons.map(b=>Boolean(b.props.disabled)),[true,true,false]);
  app.toolbar().onClear();assert.equal(app.state.get('showCancelled'),false);
});

test('cancellation refreshes a fresh read without hiding the table or repeating the mutation', async () => {
  const {transactions}=require('./helpers/finance-workspace.cjs');
  const row={...transactions[0],id:'to-cancel',concept:'Pago para anular'};
  const calls=[];let release;
  const mutation=new Promise(resolve=>{release=resolve;});
  const request=async(url,options)=>{
    calls.push({url,options});
    if(options?.method==='POST'){await mutation;return {};}
    if(url.includes('transaction_id='))return {transaction:row,operation:null};
    if(url.includes('action=transactions'))return {transactions:[{...row,financial_operations:{id:'op',operation_type:'general',version:2,status:'cancelled',detail:{}}}],features:{financialOperations:true}};
    return {};
  };
  const app=workspace({transactions:[row]},'',{request});
  const action=app.find(el=>el.props?.title==='Anular movimiento');
  const first=action.props.onClick();
  await Promise.resolve();await Promise.resolve();
  await action.props.onClick();
  assert.equal(calls.filter(c=>c.options?.method==='POST').length,1);
  assert.equal(app.state.get('loading'),false);
  release();await first;
  assert.equal(app.state.get('loading'),false);assert.equal(app.state.get('cancellingTransactionId'),null);
  const read=calls.find(c=>c.url.includes('action=transactions'));assert.ok(read.options,'Refresh bypasses pre-mutation shared reads');
  assert.ok(!app.markup().includes('Pago para anular'));
});

test('an older movement response cannot overwrite the refreshed cancellation state', async () => {
  const {transactions}=require('./helpers/finance-workspace.cjs');
  const pending=[];
  const app=workspace({},'',{request:()=>new Promise(resolve=>pending.push(resolve))});
  app.toolbar().onRefresh();app.toolbar().onRefresh();
  const latest={...transactions[0],id:'latest',concept:'Estado actualizado'};
  pending[1]({transactions:[latest]});await new Promise(resolve=>setImmediate(resolve));
  pending[0]({transactions:[transactions[1]]});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.state.get('transactions')[0].id,'latest');
});

test('viewing cancellation history does not inflate the expense summary under an outgoing filter', () => {
  const {transactions}=require('./helpers/finance-workspace.cjs');
  const inactive={...transactions[0],type:'egreso',financial_operations:{id:'op',operation_type:'general',version:2,status:'cancelled',detail:{}}};
  const app=workspace({transactions:[inactive,transactions[1]],showSummary:true,showCancelled:true,filterType:'egreso'});
  const html=app.markup();assert.ok(html.includes('-$13.700'));assert.ok(!html.includes('-$25.700'));
});

test('movement overflow uses measured available width and reserves space for its menu', () => {
  const fs = require('node:fs');
  const ts = require('typescript');
  const vm = require('node:vm');
  const source = fs.readFileSync('src/components/finanzas/FinanceToolbar.tsx', 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => name.startsWith('@/components/ui/') ? {__esModule:true,default:()=>null} : name === '@/lib/financialAccountLabels' ? { financialAccountLabel: value => value } : require(name)
  });
  const widths = [150, 120, 160, 140, 130, 160, 140];
  for (const [available, expected] of [[900, 3], [899, 2], [880, 2], [879, 1], [742, 1], [741, 0], [300, 0]]) {
    assert.equal(exports.visibleMovementCount(available, widths), expected);
  }
});

test('Excel includes every matching row for the selected accounts and refuses a stale date range', async () => {
  const { transactions } = require('./helpers/finance-workspace.cjs');
  const cashAndBank = transactions.map((tx, i) => ({ ...tx, financial_account_id: i % 2 ? 'cash' : 'bank' }));
  const excluded = { ...transactions[0], id: 'other-account', financial_account_id: 'usd' };
  let exported;
  const app = workspace({
    transactions: [...cashAndBank, excluded],
    loadedPeriod: '2026-08-29/2026-09-28',
    currentPage: 2,
  }, '', { downloadExcel: async rows => { exported = rows; } });

  app.toolbar().onAccounts(['cash', 'bank']);
  app.render();
  assert.equal(app.state.get('currentPage'), 1);
  await app.toolbar().onExportExcel();
  assert.deepEqual(Array.from(exported, row => row.id), cashAndBank.map(row => row.id));

  app.toolbar().onDateRange('2026-09-01', '2026-09-28');
  app.render();
  assert.equal(app.toolbar().exportDisabled, true);
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

test('filters reset pagination and clear restores the default range', async () => {
  const requests = [];
  const app = workspace({ currentPage: 3, filterCategory: 'Sueldos', filterCostCenterId: 'unit' }, '', {
    request: async url => { requests.push(url); return {}; }
  });
  app.toolbar().onSearch('herramientas');
  assert.equal(app.state.get('currentPage'), 1);
  app.state.set('currentPage', 3);
  app.render(); app.toolbar().onDateRange('2026-09-03', '2026-09-09');
  assert.equal(app.state.get('currentPage'), 1);
  assert.match(app.markup(), /03\/09\/2026 - 09\/09\/2026/);
  app.toolbar().onRefresh();
  assert.match(requests[0], /startDate=2026-09-03&endDate=2026-09-09/);
  app.toolbar().onClear(); app.render();
  assert.equal(app.state.get('searchTerm'), '');
  assert.equal(app.state.get('filterCategory'), 'all');
  assert.equal(app.state.get('filterCostCenterId'), 'all');
  assert.equal(app.toolbar().isDefaultPeriod, true);
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
  for (const [query, title] of [['', 'Movimientos'], ['tab=accounts', 'Cuentas y saldos'], ['tab=cc', 'CC Proveedores'], ['tab=cc-clientes', 'CC Clientes'], ['tab=validations', 'Comprobantes a validar']]) {
    const html = workspace({}, query).markup();
    assert.ok(html.includes(`>${title}</h1>`), query);
    assert.ok(!html.includes('Estado de Resultados'));
    assert.ok(!html.includes('>Flujo General</button>'));
  }
});


test('supplier and customer accounts have independent screens and active navigation', () => {
  const React = require('react');
  const supplierAccounts = () => React.createElement('section', null, 'Proveedor de control');
  const clientsBalances = [{id:'client',full_name:'Cliente de control',balance_ars:123,balance_usd:0}];
  for (const [query, supplier] of [['tab=cc',true],['tab=cc-clientes',false]]) {
    const app = workspace({clientsBalances},query,{supplierAccounts});
    const html = app.markup();
    assert.equal(html.includes('Proveedor de control'),supplier);
    assert.equal(html.includes('Cliente de control'),!supplier);
    assert.equal(html.includes('Saldos de Clientes'),!supplier);
    assert.ok(html.includes('href="/admin/finanzas?tab='+ (supplier?'cc':'cc-clientes') +'" aria-current="page"'));
    assert.equal(app.writes(),0);
  }
});
