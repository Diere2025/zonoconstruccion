const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const load=(file,imports={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL,require:name=>{if(!(name in imports))throw Error(name);return imports[name];}});return exports;};
const helpers=load('src/lib/supplierAccount.ts'),opening=load('src/lib/supplierAccounts/opening.ts',{'../supplierAccount':helpers});
class OperationError extends Error{constructor(message,status){super(message);this.status=status;}}
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const calls=[],api=(denied=null,error=null)=>load('src/app/api/admin/supplier-opening/route.ts',{
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200,headers:options?.headers})}},
 '@/lib/supplierAccounts/server':{supplierAccountContext:async()=>{if(denied)throw new OperationError('Acceso denegado',denied);return {actor:id(1),db:{rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_supplier_opening_detail'?{start:{supplier_id:id(2)}}:{},error};}}};}},
 '@/lib/supplierAccount':helpers,'@/lib/supplierAccounts/opening':opening,'@/lib/financialOperations/validation':{OperationError}
});
const request=body=>({url:'http://localhost/api/admin/supplier-opening?supplierId='+id(2),json:async()=>body});
(async()=>{
 for(const status of [401,403]){assert.equal((await api(status).GET(request())).status,status);assert.equal((await api(status).POST(request({}))).status,status);}assert.equal(calls.length,0);
 assert.equal((await api().GET({url:'http://localhost/api/admin/supplier-opening?supplierId=invalid'})).status,400);assert.equal(calls.length,0);
 const body={supplierId:id(2),requestId:id(3),signature:'a'.repeat(32),reason:'Respaldo de apertura',items:[{reference:' F-1 ',currency:'ARS',amount:100,condition:'facturado',documentDate:'2025-12-01',dueDate:'',evidence:' Planilla fila 3 '}]};
 assert.equal((await api().POST(request({...body,items:[{...body.items[0],dueDate:'2026-02-30'}]}))).status,400);assert.equal(calls.length,0);
 assert.equal((await api().POST(request(body))).status,200);assert.equal(calls[0].name,'save_supplier_opening_detail');assert.equal(calls[0].args.p_actor,id(1));assert.equal(calls[0].args.p_payload.items[0].amount,'100.00');assert.equal(calls[0].args.p_payload.items[0].reference,'F-1');
 assert.equal((await api().GET(request())).headers['Cache-Control'],'no-store');
 for(const [code,status] of [['40001',409],['23505',409],['42501',403],['PGRST202',503]])assert.equal((await api(null,{code,message:'Error controlado'}).POST(request(body))).status,status);
 console.log('Opening API: verified context, input normalization, calendar validation, private responses and conflict statuses: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
