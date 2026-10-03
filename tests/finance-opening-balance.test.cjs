const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function route(prior,options={}) {
  const exports = {};
  let reads = 0;
  const selections=[];
  const db = {
    rpc: async () => prior,
    from: () => {
      reads++;
      let selection='';
      const query = { then: resolve => {
        if(selection==='operation_id' && options.probeError)return Promise.resolve({data:null,error:options.probeError}).then(resolve);
        if(selection.includes('financial_operations(') && options.relationshipError)return Promise.resolve({data:null,error:options.relationshipError}).then(resolve);
        if(options.allocationsAvailable && selection.includes('supplier_purchases('))return Promise.resolve({data:null,error:{code:'PGRST201',message:'Multiple supplier purchase relationships'}}).then(resolve);
        return Promise.resolve({ data: selection==='operation_id'?[]:options.transactions || [], error: null }).then(resolve);
      }};
      query.select=text=>{selection=text;selections.push(text);return query;};
      for (const method of ['limit','lte', 'gte', 'order', 'range']) query[method] = () => query;
      return query;
    }
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/finanzas-data/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText, {
    exports, process: { env: {} }, URL, Date,
    console: { error() {} },
    require: name => name === '@supabase/supabase-js' ? { createClient: () => db }
      : name === 'next/server' ? { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }
      : name === '@/lib/financialOperations/server' ? {financialContext:async()=>({db})}
      : name === '@/lib/financialOperations/validation' ? {OperationError:class extends Error {}}
      : { compareTreasuryTransactions: () => 0 }
  });
  return { GET: exports.GET, reads: () => reads,selections };
}

test('opening balance timeout fails the response before loading movements', async () => {
  const api = route({ error: { code: '57014', message: 'canceling statement due to statement timeout' } });
  const response = await api.GET({ url: 'https://example.test/api?action=transactions&startDate=2026-09-01' });
  assert.equal(response.status, 503);
  assert.equal(api.reads(), 0);
  assert.equal(response.body.transactions, undefined);
});

test('missing opening balance payload cannot become a zero balance', async () => {
  const api = route({ data: null, error: null });
  const response = await api.GET({ url: 'https://example.test/api?action=transactions&startDate=2026-09-01' });
  assert.equal(response.status, 500);
  assert.equal(api.reads(), 0);
});

test('pending migration preserves legacy movement reads and their running balances',async()=>{
 const api=route({data:[{account_id:'account',balance:100}],error:null},{probeError:{code:'42703',message:'column cash_transactions.operation_id does not exist'},transactions:[{id:'tx',created_at:'2026-10-01',financial_account_id:'account',amount:25,type:'egreso'}]});
 const response=await api.GET({url:'https://example.test/api?action=transactions&startDate=2026-10-01'});
 assert.equal(response.status,200);assert.equal(response.body.features.financialOperations,false);
 assert.equal(response.body.transactions[0].running_balance,75);
 assert.ok(!api.selections[1].includes('financial_operations('));assert.ok(!api.selections[1].replace('payment_planning_realizations(id,item_id,reversed_at)','').includes('reversed_at'));
});
test('missing operation relationship retries only the legacy query',async()=>{
 const api=route({data:[],error:null},{relationshipError:{code:'PGRST200',message:"relationship between cash_transactions and financial_operations was not found"}});
 const response=await api.GET({url:'https://example.test/api?action=transactions&startDate=2026-10-01'});
 assert.equal(response.status,200);assert.equal(response.body.features.financialOperations,false);
 assert.equal(api.reads(),3);assert.ok(!api.selections[2].includes('financial_operations('));
});
test('permission errors do not fall back to another ledger read',async()=>{
 const api=route({data:[],error:null},{probeError:{code:'42501',message:'permission denied'}});
 const response=await api.GET({url:'https://example.test/api?action=transactions&startDate=2026-10-01'});
 assert.equal(response.status,500);assert.equal(api.reads(),1);
});

test('active migration reads supplier invoices despite allocation relationship',async()=>{
 const api=route({data:[],error:null},{allocationsAvailable:true,transactions:[{id:'tx',created_at:'2026-10-01',financial_account_id:'account',amount:25,type:'egreso'}]});
 const response=await api.GET({url:'https://example.test/api?action=transactions&startDate=2026-10-01'});
 assert.equal(response.status,200);
 assert.equal(response.body.features.financialOperations,true);
 assert.equal(response.body.transactions.length,1);
});
