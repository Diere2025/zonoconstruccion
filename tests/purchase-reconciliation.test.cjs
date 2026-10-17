const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const account={};vm.runInNewContext(compile('src/lib/supplierAccount.ts'),{exports:account});
const model={};vm.runInNewContext(compile('src/lib/purchaseReconciliation.ts'),{exports:model,require:()=>account,Number,Math,Set});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const line={receiptItemId:id(3),quantity:2,unitPrice:100,discount:10,vat:21};
const payload={id:id(1),requestId:id(2),supplierId:id(4),version:0,number:' FC-1 ',type:'Factura',currency:'ARS',date:'2026-10-17',dueDate:null,perceptionsBa:2,perceptionsCaba:0,perceptionsOther:0,declaredTotal:219.8,notes:'',resolution:'',confirm:false,lines:[line]};
assert.equal(model.billLineTotals(line).net,180);assert.equal(model.billLineTotals(line).tax,37.8);assert.equal(model.billLineTotals(line).cost,90);
assert.equal(model.billTotals([line],2,219.8).difference,0);
assert.equal(model.validateSupplierBill(payload).number,'FC-1');
for(const change of [{date:'2026-02-30'},{dueDate:'17/10/2026'},{currency:'EUR'},{version:-1},{confirm:'true'},{declaredTotal:Infinity},{lines:[line,line]},{lines:[{...line,quantity:1.0001}]},{lines:[{...line,vat:-1}]},{lines:[{...line,discount:101}]}])assert.throws(()=>model.validateSupplierBill({...payload,...change}));
function api(denied,db){
  const exports={};vm.runInNewContext(compile('src/app/api/admin/purchase-reconciliation/route.ts'),{exports,URL,process:{env:{}},require(name){
    if(name==='next/server')return{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
    if(name==='@supabase/supabase-js')return{createClient:()=>{if(!db)throw Error('Forbidden access');return db;}};
    if(name==='@/lib/purchaseAccess')return{requirePurchaseOperator:async()=>denied};
    if(name==='@/lib/supplierAccount')return account;
    if(name==='@/lib/purchaseReconciliation')return model;
    throw Error(name);
  }});return exports;
}
const request=body=>({url:'https://example.com/api/admin/purchase-reconciliation',headers:new Headers({authorization:'Bearer test'}),json:async()=>body});
(async()=>{
  for(const status of [401,403]){const routes=api({status,error:'Denied'});assert.equal((await routes.GET(request())).status,status);assert.equal((await routes.POST(request(payload))).status,status);}
  let writes=[];const db={auth:{getUser:async()=>({data:{user:{id:id(9)}},error:null})},rpc:async(name,args)=>{writes.push({name,args});return{data:id(1),error:null};}};
  const routes=api(null,db);
  assert.equal((await routes.POST(request({...payload,lines:[]}))).status,400);assert.equal(writes.length,0);
  assert.equal((await routes.POST(request(payload))).status,200);assert.equal(writes[0].name,'save_supplier_bill');assert.equal(writes[0].args.p_user,id(9));
  assert.equal((await routes.POST(request({...payload,void:true,version:1,resolution:''}))).status,400);
  assert.equal((await routes.POST(request({...payload,void:true,version:1,resolution:'Error de proveedor'}))).status,200);
  assert.equal(writes[1].args.p_payload.void,true);assert.equal(writes[1].args.p_payload.lines,undefined);
  db.rpc=async()=>({error:{code:'PGRST202'}});assert.equal((await routes.POST(request(payload))).status,503);
  db.rpc=async()=>({error:{code:'23505',message:'Duplicado'}});assert.equal((await routes.POST(request(payload))).status,409);
  console.log('Purchase reconciliation calculations, dates, input validation, operator authorization, server actor, atomic RPC and errors: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
