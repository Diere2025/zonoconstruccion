const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Set,Map,Date,Number,String,JSON,Intl,require:n=>imports[n]||{}});return exports;}
const {applySettlementTerms}=load('src/lib/logisticsDispatch/settlementAccounting.ts');
const {pendingDispatchSettlements,dayPaymentSummary}=load('src/lib/logisticsDispatch/planningPresentation.ts');
const {dispatchPaymentLabel}=load('src/components/logistics/DispatchPaymentSummary.tsx');
const plan=(id,paid)=>({dispatch_id:id,status:'completed',planned:{historicalImport:true,agreedAmount:null},actual:{extras:[]},paymentState:{state:paid?'paid':'unpaid',liquidated:!!paid,paidAmount:paid,payments:paid?[{id:'existing-payment'}]:[]}});
const input=[plan('05440',241600),plan('05441',316800),plan('05442',65950),plan('unpaid',null),{...plan('cancelled',null),status:'cancelled'},{...plan('planned',null),status:'planned'},plan('approved-fee',300000)];
const original=JSON.stringify(input);
const rows=applySettlementTerms(input,[{dispatch_id:'05442',gross_amount:88400,net_amount:65940,deductions:[{kind:'offset',amount:22460}],extra_snapshot:[]}],[{dispatch_id:'approved-fee',total:300000,fee:{additions:[]}}]);
assert.equal(JSON.stringify(input),original,'The read projection must not modify stored inputs');
for(const id of ['05440','05441']){const row=rows.find(r=>r.dispatch_id===id);assert.equal(row.serviceCostConfirmed,false);assert.equal(row.paymentState.liquidated,false);assert.equal(row.paymentState.remainingAmount,null);assert.equal(row.paymentState.paidAmount,input.find(r=>r.dispatch_id===id).paymentState.paidAmount);assert.equal(dispatchPaymentLabel(row),'Pago registrado · costo por confirmar');}
assert.equal(rows[2].paymentState.liquidated,true);assert.equal(rows[2].paymentState.minorDifference,10);assert.equal(rows[6].serviceCostConfirmed,true);assert.equal(rows[6].paymentState.liquidated,true);
const entries=pendingDispatchSettlements(rows);assert.deepEqual(Array.from(entries,e=>e.row.dispatch_id),['05440','05441','unpaid']);assert(entries.every(e=>e.kind==='review'&&e.amount===null));
const summary=dayPaymentSummary(rows);assert.equal(summary.pending,3);assert.equal(summary.paid,2);assert.equal(dispatchPaymentLabel(rows[3]),'Costo por confirmar');
const provisional=applySettlementTerms([plan('provisional',300000)],[],[{dispatch_id:'provisional',total:300000,fee:{provisional:true}}])[0];assert.equal(provisional.settlementNeedsReview,true);assert.equal(provisional.paymentState.liquidated,false);
console.log('PASS: paid historical services without confirmed cost stay in review; documented offsets, confirmed fees, final review, payments and inactive trips preserved.');
