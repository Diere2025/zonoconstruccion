const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Map,Set,Date,Number,String,JSON,Intl,process:{env:{NODE_ENV:'production'}},require:n=>imports[n]||{}});return exports;}
let comparisons=0;
const plan={dispatch_id:'trip',status:'completed',planned:{loads:[],agreedAmount:300000},actual:{km:100},logistics_dispatches:{code:'LOG_REC_05526'}};
const comparison={rows:[],issues:[{code:'LOG_REC_05526',amount:250000,row:5158,paymentDate:'2026-10-23'}]};
const q={select(){return this},eq(){return this},order(){return this},gte(){return this},lte(){return this}};
const route=load('src/app/api/admin/logistica-planificacion/route.ts',{
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
 '@/lib/logisticsDispatch/planningServer':{planningAccess:async()=>({db:{from:()=>q,rpc:async()=>({data:true})},actor:'actor',canWrite:true,admin:true}),planningPeriod(){},planningRows:async()=>[plan],planningCatalog:async()=>[],planningPreferences:async()=>({})},
 '@/lib/logisticsDispatch/planningSourcePaymentsServer':{planningSourcePaymentPreview:async()=>{comparisons++;return comparison}},
 '@/lib/logisticsDispatch/planningOrdersServer':{planningOrderLoads:async(_,rows)=>rows},
 '@/lib/logisticsDispatch/planningPaymentsServer':{planningPaymentStates:async(_,rows)=>rows.map(p=>({...p,paymentState:{state:'unpaid',paidAmount:null}}))},
 '@/lib/logisticsDispatch/planningRenditionsServer':{planningRenditions:async(_,rows)=>rows},
 '@/lib/logisticsDispatch/planningTasksServer':{planningSharedTasks:async(_,plans)=>({plans})},
 '@/lib/logisticsDispatch/workflowServer':{freightWorkflowData:async()=>({})},
 '@/lib/logisticsDispatch/planningCorrections':{correctPlanningView:v=>v}
});
(async()=>{
 const url='https://erp.example/api/admin/logistica-planificacion?from=2026-10-23&to=2026-10-24';
 const before=await route.GET({url});assert.equal(before.status,200);assert.equal(comparisons,0);assert.equal(before.body.plans[0].paymentState.paidAmount,null);assert.equal(before.body.plans[0].paymentSourcePending,undefined);
 const preview=await route.GET({url:url+'&action=payment-source-preview'});assert.equal(preview.status,200);assert.equal(preview.body.issues[0].amount,250000);assert.equal(comparisons,1);
 const after=await route.GET({url});assert.equal(comparisons,1);assert.equal(after.body.plans[0].paymentState.state,'unpaid');assert.equal(after.body.plans[0].paymentSourcePending,undefined);
 const disabled=await route.POST({json:async()=>({action:'reconcile-payment-links',transactionIds:['sheet-match']})});assert.equal(disabled.status,410);assert.equal(comparisons,1);
 const liquidation=load('src/lib/logisticsDispatch/liquidation.ts',{'./planning':{estimateDispatchFee:()=>({amount:300000,review:[]}),validateDispatchExtras:()=>[]}});
 const stale={...plan,paymentState:{paidAmount:null},paymentSourcePending:comparison.issues};
 assert.equal(liquidation.approveLiquidation(stale,{basis:'agreed',base:300000}).total,300000);
 assert.throws(()=>liquidation.approveLiquidation({...stale,paymentState:{paidAmount:250000}},{basis:'agreed',base:300000}),/Ya hay pagos/);
 console.log('PASS: sheet comparison is explicit and read-only; sheet-only entries do not block liquidation; ERP payments still prevent duplicates.');
})().catch(e=>{console.error(e);process.exitCode=1});
