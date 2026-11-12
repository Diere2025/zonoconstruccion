const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,require){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Request,Response,URL,Intl,Date,Set,Map,Number,Object,Array,Error});return exports;}
const model=load('src/lib/eerrNative/model.ts');
const exchangeModel=load('src/lib/eerrNative/exchanges.ts');
function api({denied=null,rpcError=null,missing=false,exclusions=[],now}={}){
 const trace=[];
 let reads=0,writes=0;const db={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},rpc:async()=>{writes++;return {data:{version:1},error:rpcError};},from:table=>{
  reads++;const result=table==='eerr_monthly_provisions'?{data:null,error:missing?{code:'42P01'}:null}:{data:[],error:null};
  const q={then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};for(const method of ['select','eq','gte','lt','order','range','in','maybeSingle'])q[method]=(...args)=>{trace.push({table,method,args});return q;};return q;
 }};
 const route=load('src/app/api/admin/finanzas/eerr-native/route.ts',name=>{
  if(name==='next/server')return {NextResponse:{json:(body,init)=>Response.json(body,init)}};
  if(name.includes('financeAdminAccess'))return {requireFinanceAdmin:async()=>denied};
  if(name.includes('costs/server'))return {costDatabase:()=>db};
  if(name.includes('rentabilidad-diaria'))return {GET:async request=>{trace.push({marginUrl:request.url});return Response.json({orders:[],exclusions});}};
  if(name.includes('partnerReporting'))return {partnerAssignments:async()=>new Map()};
  if(name.includes('readBatches'))return {readBatches:async()=>{}};
  if(name.includes('eerrNative/model'))return now ? {...model,localYesterday:()=>model.localYesterday(now)} : model;
  if(name.includes('eerrNative/exchanges'))return exchangeModel;
  if(name.endsWith('/advertising'))return {metaCostStart:'2026-10-01'};
  if(name.endsWith('/advertisingServer'))return {readAdvertising:async()=>undefined};
  throw new Error(name);
 });return {...route,reads:()=>reads,writes:()=>writes,trace};
}
const request=(body)=>new Request('https://erp.test/api/admin/finanzas/eerr-native?month=2026-10',{headers:{authorization:'Bearer test'},...(body?{method:'PUT',body:JSON.stringify(body)}:{})});
test('both native endpoints reject unauthorized access before database reads or writes',async()=>{const a=api({denied:{status:403,error:'Sin permiso'}});assert.equal((await a.GET(request())).status,403);assert.equal((await a.PUT(request({}))).status,403);assert.equal(a.reads(),0);assert.equal(a.writes(),0);});
test('missing schema permits read-only preview without silently enabling saving',async()=>{const a=api({missing:true}),r=await a.GET(request()),body=await r.json();assert.equal(r.status,200);assert.equal(body.canSave,false);assert.ok(body.migrationNotice);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(a.writes(),0);});
test('selected cutoff reaches delivery query and ledger cutoff inclusively',async()=>{const a=api(),req=new Request(request().url+'&until=2026-10-10'),response=await a.GET(req),body=await response.json();assert.equal(response.status,200);assert.equal(body.period.cutoff,'2026-10-10');assert.equal(body.days.length,10);const margin=new URL(a.trace.find(t=>t.marginUrl).marginUrl);assert.equal(margin.searchParams.get('from'),'2026-10-01');assert.equal(margin.searchParams.get('to'),'2026-10-10');assert.ok(a.trace.some(t=>t.table==='cash_transactions'&&t.method==='lt'&&t.args[1]==='2026-10-11T00:00:00-03:00'));});
test('invalid cutoff is rejected before database reads',async()=>{const a=api(),response=await a.GET(new Request(request().url+'&until=2026-11-01'));assert.equal(response.status,400);assert.equal(a.reads(),0);});
test('the report stops at yesterday in Buenos Aires and rejects today',async()=>{
 const a=api({now:new Date('2026-10-12T02:59:59Z')});
 const response=await a.GET(request());
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.period.cutoff,'2026-10-10');
 const margin=new URL(a.trace.find(entry=>entry.marginUrl).marginUrl);
 assert.equal(margin.searchParams.get('to'),'2026-10-10');
 assert.ok(a.trace.some(entry=>entry.table==='cash_transactions'&&entry.method==='lt'&&entry.args[1]==='2026-10-11T00:00:00-03:00'));
 const reads=a.reads();
 const rejected=await a.GET(new Request(request().url+'&until=2026-10-11'));
 assert.equal(rejected.status,400);
 assert.match((await rejected.json()).error,/10\/10\/2026/);
 assert.equal(a.reads(),reads);
});
test('on the first local day of a month the previous month is available in full',async()=>{
 const a=api({now:new Date('2026-11-01T03:00:00Z')});
 const response=await a.GET(request());
 assert.equal(response.status,200);
 assert.equal((await response.json()).period.cutoff,'2026-10-31');
 assert.equal((await a.GET(new Request(request().url.replace('2026-10','2026-11')))).status,400);
});
test('upstream excluded deliveries block result and dates are localized',async()=>{const a=api({exclusions:[{code:'PED1',reason:'Conflicto 2026-10-01'}]}),body=await (await a.GET(request())).json();assert.equal(body.totals.result,null);assert.equal(body.status,'incomplete');assert.equal(body.issues[0].reason,'Conflicto 01/10/2026');});
test('intentional cancellation and ENC exclusions stay visible without blocking the result',async()=>{const a=api({exclusions:[{code:'ANULADO',reason:'Pedido anulado',affectsResult:false},{code:'ENC1',reason:'Encomienda',affectsResult:false}]}),body=await (await a.GET(request())).json();assert.equal(body.totals.result,0);assert.equal(body.issues.length,0);assert.equal(body.omittedOrders.length,2);});
test('invalid provision cannot reach RPC and stale writes produce conflict',async()=>{const a=api();assert.equal((await a.PUT(request({month:'2026-10',version:0,provisions:{Sueldos:{amount:-1,status:'estimated',note:'Prueba'}}}))).status,400);assert.equal(a.writes(),0);const stale=api({rpcError:{code:'40001',message:'Recargar'}});assert.equal((await stale.PUT(request({month:'2026-10',version:0,provisions:{}}))).status,409);});
