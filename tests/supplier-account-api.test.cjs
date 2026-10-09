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
      if (name === '@/lib/financialOperations/referenceServer') return {};
      throw new Error(name);
    }
  });
  return exports;
}
const request = body => ({ url: 'https://example.com/api/admin/supplier-accounts', headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
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
  console.log('Multi-order API payload, duplicate selection and legacy clients: OK');
  console.log('Supplier account API authentication, invalid openings and document ownership: OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
