const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helpers = {};
vm.runInNewContext(compile('src/lib/supplierAccount.ts'), { exports: helpers });

function load(denied, database, purchaseDenied = denied) {
  const exports = {};
  vm.runInNewContext(compile('src/app/api/admin/supplier-accounts/route.ts'), {
    exports, URL, process: { env: {} },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
      if (name === '@supabase/supabase-js') return { createClient: () => { if (!database) throw new Error('Unauthorized database access'); return database; } };
      if (name === '@/lib/purchaseAccess') return {requirePurchaseOperator: async () => purchaseDenied};
      if (name === '@/lib/financeAdminAccess') return { requireFinanceAdmin: async () => denied };
      if (name === '@/lib/supplierAccount') return helpers;
      if (name === '@/lib/financialOperations/references') return {};
      if (name === '@/lib/financialOperations/referenceServer') return {
        supplierReferenceData:async()=>({movements:[],byPayment:new Map(),byPurchase:new Map([[documentId(1),[{code:'DOC-VINCULADO'}]]])})
      };
      if (name === '@/lib/supplierAccounts/sheetSync') return { processSupplierSheetJob: async () => ({synced:true,queued:false}) };
      throw new Error(name);
    }
  });
  return exports;
}
const request = body => ({ url: 'https://example.com/api/admin/supplier-accounts', headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
const documentId=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
(async () => {
  for (const status of [401, 403]) {
    const api = load({ status, error: 'Denied' });
    assert.equal((await api.GET(request())).status, status);
    assert.equal((await api.POST(request({ action: 'start' }))).status, status);
  }
  let writes = 0;
  const builder = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => { writes++; return { error: null }; } };
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }) }, from: () => builder };
  const api = load(null, db);
  assert.equal((await api.GET({ ...request(), url:'https://example.com/api/admin/supplier-accounts?from=2026-02-30' })).status,400);
  assert.equal((await api.GET({ ...request(), url:'https://example.com/api/admin/supplier-accounts?from=2026-10-30&to=2026-10-01' })).status,400);
  const supplierId = '00000000-0000-0000-0000-000000000001';
  const valid = { action: 'start', supplierId, startDate: '2026-09-29', openingArs: 0, openingUsd: -10, notes: 'Conciliado' };
  assert.equal((await api.POST(request({ ...valid, startDate: '2026-02-30' }))).status, 400);
  assert.equal((await api.POST(request({ ...valid, openingArs: 'Infinity' }))).status, 400);
  assert.equal((await api.POST(request({ ...valid, notes: '' }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await api.POST(request(valid))).status, 200);
  assert.equal(writes, 1);
  const foreign = await api.POST(request({ action: 'history', supplierId, source: 'purchase', sourceId: '00000000-0000-0000-0000-000000000002', included: true, notes: 'Incluir' }));
  assert.equal(foreign.status, 400);
  assert.equal(writes, 1, 'A missing or foreign document cannot be added to the ledger');
  let rpc;
  db.rpc = async (name, values) => {rpc={name,values};return {data:'receipt',error:null};};
  const receiptBody={action:'receipt',id:supplierId,supplierId,date:'2026-10-09',currency:'ARS',stock:false,close:false,items:[{quantity:1,unitCost:12}],poIds:[supplierId]};
  assert.equal((await api.POST(request(receiptBody))).status,200);
  assert.equal(rpc.name,'register_supplier_receipt_multi');assert.equal(rpc.values.p_pos[0],supplierId);assert.equal('p_po' in rpc.values,false);
  assert.equal((await api.POST(request({...receiptBody,poIds:[supplierId,supplierId]}))).status,400);
  assert.equal((await api.POST(request({...receiptBody,poIds:['wrong']}))).status,400);
  const operatorApi=load({status:403,error:'Admin only'},db,null);
  assert.equal((await operatorApi.POST(request(receiptBody))).status,200,'Compras can register receipts');
  assert.equal((await operatorApi.GET(request())).status,403,'Compras cannot read finance balances');
  assert.equal((await operatorApi.POST(request(valid))).status,403,'Compras cannot configure opening balances');
  assert.equal((await load(null,db,{status:403,error:'No compras'}).POST(request(receiptBody))).status,403);
  const legacy={...receiptBody};delete legacy.poIds;
  assert.equal((await api.POST(request(legacy))).status,200);assert.equal(rpc.name,'register_supplier_receipt');
  const entries=Array.from({length:52},(_,i)=>({
    source:'purchase',source_id:documentId(i+1),currency:'ARS',reference:'REM-'+(i+1),kind:'Remito',
    entry_date:new Date(Date.UTC(2026,7,i+1)).toISOString().slice(0,10),amount:10,voided:false
  }));
  const history=[{source:'purchase',source_id:documentId(1),included:true,notes:'Revisado'}];
  db.from=table=>({
    select(){return this;},eq(){return this;},order(){return this;},
    maybeSingle:async()=>({data:{start_date:'2026-10-01',opening_ars:200,opening_usd:0}}),
    range:async()=>({data:structuredClone(table==='supplier_account_entries'?entries:history)})
  });
  const get=(query)=>api.GET({...request(),url:'https://example.com/api/admin/supplier-accounts?supplierId='+supplierId+query});
  const first=(await get('&view=history&currency=ARS')).body;
  const last=(await get('&view=history&currency=ARS&page=1')).body;
  assert.equal(first.total,52);assert.equal(first.rows.length,50);assert.equal(first.rows[0].reference,'REM-52');
  assert.equal(last.rows.length,2);assert.equal(last.rows[1].reference,'REM-1');
  assert.equal(last.rows[1].balance,210);assert.equal(first.balance_ars,210);
  const found=(await get('&view=history&currency=ARS&q=doc-vinculado')).body;
  assert.equal(found.total,1);assert.equal(found.rows[0].reference,'REM-1');
  assert.equal((await get('&view=history&currency=ARS&page=-1')).status,400);
  const old=(await get('')).body;
  assert.equal(old.rows.length,52);assert.equal(old.rows[0].reference,'REM-1');
  const currentStart='2026-08-01';
  const from=db.from;
  db.from=table=>table==='supplier_account_starts'
    ? {...from(table),maybeSingle:async()=>({data:{start_date:currentStart,opening_ars:200,opening_usd:0}})}
    : from(table);
  const recent=(await get('&view=current&currency=ARS')).body;
  const earliest=(await get('&view=current&currency=ARS&page=1')).body;
  assert.equal(recent.total,52);
  assert.deepEqual([recent.rows[0].reference,recent.rows[0].balance],['REM-52',720]);
  assert.equal(recent.rows[49].reference,'REM-3');
  assert.deepEqual(Array.from(earliest.rows,row=>[row.reference,row.balance]),[['REM-2',220],['REM-1',210]]);
  const period=(await get('&view=current&currency=ARS&from=2026-08-06&to=2026-08-12&all=1')).body;
  assert.equal(period.total,7);
  assert.equal(period.previous_balance_ars,250);
  assert.equal(period.balance_ars,320);
  assert.deepEqual([period.rows[0].reference,period.rows.at(-1).reference],['REM-12','REM-6']);
  const exportRows=(await get('&view=current&currency=ARS&page=1&all=1')).body;
  assert.equal(exportRows.rows.length,52);
  assert.equal(exportRows.rows[0].reference,'REM-52');
  let dashboardRpc;
  db.rpc=(name,params)=>{dashboardRpc={name,params};return {range:async()=>({data:[{name:'Cooper',balance_ars:320}],error:null})};};
  const dashboard=(await api.GET({...request(),url:'https://example.com/api/admin/supplier-accounts?to=2026-08-12'})).body;
  assert.equal(dashboardRpc.name,'get_supplier_account_balances_at');
  assert.equal(dashboardRpc.params.p_to,'2026-08-12');
  assert.equal(dashboard.suppliers[0].balance_ars,320);
  const settingsWrites=[];
  db.from=table=>({
    select(){return this;},eq(){return this;},
    single:async()=>({data:{inactivity_months:9},error:null}),
    upsert:async value=>{settingsWrites.push({table,value});return {error:null};},
  });
  const visibility=(await api.GET({...request(),url:'https://example.com/api/admin/supplier-accounts?view=dashboard'})).body;
  assert.equal(dashboardRpc.name,'get_supplier_account_dashboard');
  assert.equal(visibility.inactivityMonths,9);
  assert.equal((await api.POST(request({action:'setVisibilityMonths',months:0}))).status,400);
  assert.equal((await api.POST(request({action:'setSupplierVisibility',supplierId,visibility:'invalid'}))).status,400);
  assert.equal(settingsWrites.length,0);
  assert.equal((await api.POST(request({action:'setVisibilityMonths',months:9}))).status,200);
  assert.equal((await api.POST(request({action:'setSupplierVisibility',supplierId,visibility:'hidden'}))).status,200);
  assert.equal(settingsWrites[0].table,'supplier_account_visibility_settings');
  assert.equal(settingsWrites[0].value.inactivity_months,9);
  assert.equal(settingsWrites[1].table,'supplier_account_visibility_overrides');
  assert.equal(settingsWrites[1].value.visibility,'hidden');
  console.log('Multi-order API payload, duplicate selection and legacy clients: OK');
  console.log('Supplier account API authentication, invalid openings and document ownership: OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
