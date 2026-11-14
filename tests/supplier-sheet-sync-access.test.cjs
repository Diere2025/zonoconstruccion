const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const source=ts.transpileModule(fs.readFileSync('src/app/api/admin/purchase-sheet-sync/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,id='00000000-0000-0000-0000-000000000001';
function load(denied, { stockFails = false } = {}){let calls=0;const steps=[];const exports={};vm.runInNewContext(source,{exports,process:{env:{}},console:{error(){}},require:n=>{
 if(n==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
 if(n==='@supabase/supabase-js')return {createClient:()=>({})};
 if(n==='@/lib/purchaseAccess')return {requirePurchaseOperator:async()=>denied};
 if(n==='@/lib/supplierAccount')return {isUuid:v=>v===id,isAccountDate:v=>v==='2026-10-30'};
 if(n==='@/lib/supplierAccounts/sheetSync')return {withPurchaseSheetLease:async(db,work)=>work(),processSupplierSheetJob:async()=>{calls++;return {synced:true};}};
 if(n==='@/lib/erp/purchaseSheetSync')return {DEFAULT_SINCE_DATE:'2026-10-30',contrastAndSyncPurchaseSheet:async({execute})=>{calls++;steps.push(execute?'documents':'preview');return {sheetToErp:{missingOCs:[],missingReceptions:[]},erpToSheet:{missingOCs:[],missingReceptionLines:[]},executed:execute?{importedReceptionsCount:0}:undefined};},syncErpPurchaseOrdersToSheet:async()=>{calls++;steps.push('push_orders');return {};}};
 if(n==='@/lib/erp/stockSheetSync')return {syncStockFromSheet:async()=>{steps.push('stock');if(stockFails)throw Error('Stock unavailable');return {updatedCount:2};}};
 throw Error(n);
 }});return {api:exports,calls:()=>calls,steps};}
const request=b=>({nextUrl:new URL('http://localhost/api/admin/purchase-sheet-sync'),json:async()=>b});
(async()=>{for(const status of [401,403]){const {api,calls}=load({error:'Denegado',status});assert.equal((await api.GET(request())).status,status);assert.equal((await api.POST(request({action:'push_orders',poIds:[id]}))).status,status);assert.equal(calls(),0);}
 const {api,calls,steps}=load(null);assert.equal((await api.POST(request({action:'push_orders',poIds:['invalid']}))).status,400);assert.equal(calls(),0);assert.equal((await api.POST(request({action:'push_orders',poIds:[id]}))).status,200);assert.equal(calls(),1);
 assert.equal((await api.GET(request())).status,200);
 const synced=await api.POST(request({sinceDate:'2026-10-30'}));
 assert.deepEqual(steps,['push_orders','preview','documents','stock']);
 assert.equal(synced.body.stockSync.success,true);
 assert.equal(synced.body.stockSync.updatedCount,2);
 const failed=await load(null,{stockFails:true}).api.POST(request({sinceDate:'2026-10-30'}));
 assert.equal(failed.status,200);
 assert.equal(failed.body.executed.importedReceptionsCount,0);
 assert.equal(failed.body.stockSync.success,false);
 console.log('Purchase sheet sync checks access and reconciles stock after documents, even with no missing documents.');
})().catch(e=>{console.error(e);process.exitCode=1;});
