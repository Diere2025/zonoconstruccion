const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const source=ts.transpileModule(fs.readFileSync('src/app/api/admin/purchase-sheet-sync/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,id='00000000-0000-0000-0000-000000000001';
function load(denied){let calls=0;const exports={};vm.runInNewContext(source,{exports,process:{env:{}},console,require:n=>{
 if(n==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
 if(n==='@supabase/supabase-js')return {createClient:()=>({})};
 if(n==='@/lib/purchaseAccess')return {requirePurchaseOperator:async()=>denied};
 if(n==='@/lib/supplierAccount')return {isUuid:v=>v===id,isAccountDate:v=>v==='2026-10-30'};
 if(n==='@/lib/supplierAccounts/sheetSync')return {withPurchaseSheetLease:async(db,work)=>work(),processSupplierSheetJob:async()=>{calls++;return {synced:true};}};
 if(n==='@/lib/erp/purchaseSheetSync')return {DEFAULT_SINCE_DATE:'2026-10-30',contrastAndSyncPurchaseSheet:async()=>{calls++;return {};},syncErpPurchaseOrdersToSheet:async()=>{calls++;return {};}};
 throw Error(n);
 }});return {api:exports,calls:()=>calls};}
const request=b=>({nextUrl:new URL('http://localhost/api/admin/purchase-sheet-sync'),json:async()=>b});
(async()=>{for(const status of [401,403]){const {api,calls}=load({error:'Denegado',status});assert.equal((await api.GET(request())).status,status);assert.equal((await api.POST(request({action:'push_orders',poIds:[id]}))).status,status);assert.equal(calls(),0);}
 const {api,calls}=load(null);assert.equal((await api.POST(request({action:'push_orders',poIds:['invalid']}))).status,400);assert.equal(calls(),0);assert.equal((await api.POST(request({action:'push_orders',poIds:[id]}))).status,200);assert.equal(calls(),1);console.log('Sheet sync access: authenticated purchase roles required before reads/writes, UUID validation and authorized writer lease: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
