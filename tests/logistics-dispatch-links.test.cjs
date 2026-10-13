const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');const m={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsDispatch/model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m,Date,Intl,Map,Set,Number,String,JSON});
assert.equal(m.sheetDate('01/09/2026'),'2026-09-01');assert.equal(m.sheetDate('31/02/2026'),'');assert.equal(m.sheetAmount('$1.234,56'),1234.56);assert.equal(m.sheetAmount(''),null);
function order(carrier,code='JS1'){const r=[];r[0]=code;r[1]='7/09/2026';r[15]=carrier==='Jorge Salcedo'?'Postergado':'Entregado';r[79]=carrier;r[92]='LOG_REC_05344';return r;}
const follow=[];follow[0]='7/09/2026';follow[1]='LOG_REC_05344';follow[2]='Gustavo gyv';
const source=m.buildDispatchSource({logistics:[order('Jorge Salcedo'),order('Gustavo','JS2')],summary:[],follow:[follow],settlements:[],cash:[]},'2026-09-01','2026-10-12');
assert.equal(source.dispatches[0].carrierName,'Gustavo gyv');assert.equal(source.attempts.find(x=>x.orderCode==='JS1').executed,false);assert.equal(source.attempts.find(x=>x.orderCode==='JS2').executed,true);
const row={code:'LOG_REC_05344',date:'2026-09-07',type:'egreso',amount:100,concept:'GOMEZ, GUSTAVO',account:'Caja.EfectivoPesos',row:20,source:'cash'};
const ledger={id:'one',date:row.date,type:'egreso',amount:100,concept:'Gomez, Gustavo',account:'Caja Efectivo Pesos',financial_account_id:'account',is_imported:true};
assert.equal(m.matchMovements([row],[ledger],new Map()).links.length,1);
assert.equal(m.matchMovements([row],[ledger,{...ledger,id:'two'}],new Map()).links.length,0);
assert.equal(m.matchMovements([row,{...row,row:21}],[ledger],new Map()).links.length,0);
assert.equal(m.matchMovements([row],[{...ledger,is_imported:false}],new Map()).links.length,0);
assert.equal(m.matchMovements([row],[{...ledger,reversal_of_transaction_id:'reversed'}],new Map()).links.length,0);
const rend={...row,code:'REND07052'};assert.equal(m.matchMovements([rend],[ledger],new Map([['REND07052','LOG_REC_05344']])).links.length,1);
assert.equal(m.matchMovements([rend],[ledger],new Map()).links.length,0);
assert.equal(m.matchMovements([row],[ledger,{...ledger,id:'reversal',is_imported:false,reversal_of_transaction_id:'one'}],new Map()).links.length,0);
console.log('PASS dispatch parsing, cancelled attempts, account normalization, reversals and ambiguous movement matching');

// A postponed attempt and its later delivered record must belong to separate physical dispatches.
const sourceRows=(records)=>records.map(([code,orderCode,date,status,carrier])=>{const r=[];r[0]=orderCode;r[1]=date;r[15]=status;r[79]=carrier;r[92]=code;return r;});
const followRows=(records)=>records.map(([code,date,carrier])=>{const r=[];r[0]=date;r[1]=code;r[2]=carrier;return r;});
function replay(records,dispatches){return m.buildDispatchSource({logistics:sourceRows(records),follow:followRows(dispatches),summary:[],settlements:[],cash:[]},'2026-09-01','2026-10-12');}
const rescheduled=replay([
 ['LOG_REC_05390','LK01661','21/09/2026','🔴 Postergado','Jorge Salcedo'],
 ['LOG_REC_05390','LK01661','23/09/2026','🟢 Entregado','Jorge Ramallo']
],[['LOG_REC_05390','21/09/2026','Jorge Salcedo'],['LOG_REC_05395','23/09/2026','Jorge Ramallo (La Plata)']]);
assert.equal(rescheduled.issues.length,0);assert.equal(rescheduled.attempts.length,2);
assert.match(rescheduled.attempts.find(a=>a.code==='LOG_REC_05390').status,/Postergado/);
assert.equal(rescheduled.attempts.find(a=>a.code==='LOG_REC_05395').date,'2026-09-23');
const history=rescheduled.dispatches.find(d=>d.code==='LOG_REC_05395').data.attemptHistory.LK01661;
assert.equal(history[0].sourceCode,'LOG_REC_05390');assert.equal(history[0].method,'rescheduled_unique_date_carrier');
const sameDay=replay([['LOG_REC_05390','JS1','21/09/2026','🔴 Postergado','Jorge Salcedo'],['LOG_REC_05390','JS1','21/09/2026','🟢 Entregado','Jorge Salcedo']],[['LOG_REC_05390','21/09/2026','Jorge Salcedo']]);
assert.equal(sameDay.issues.length,0);assert.equal(sameDay.attempts.length,1);assert.equal(sameDay.attempts[0].sourceRows.length,2);assert.match(sameDay.attempts[0].status,/Entregado/);
const ambiguous=replay([['LOG_REC_05390','JS1','21/09/2026','Postergado','Jorge Salcedo'],['LOG_REC_05390','JS1','23/09/2026','Entregado','Jorge Ramallo']],[['LOG_REC_05390','21/09/2026','Jorge Salcedo'],['LOG_REC_05395','23/09/2026','Jorge Ramallo'],['LOG_REC_05396','23/09/2026','Jorge Ramallo']]);
assert.equal(ambiguous.attempts.length,1);assert.equal(ambiguous.issues[0].kind,'attempt_dispatch_unresolved');assert.equal(ambiguous.dispatches.find(d=>d.code==='LOG_REC_05390').data.unresolvedDeliveries.length,1);
const changedDate=replay([['LOG_REC_05390','JS1','17/10/2026','Postergado','Jorge Salcedo']],[['LOG_REC_05390','21/09/2026','Jorge Salcedo']]);
assert.equal(changedDate.issues.length,0);assert.equal(changedDate.attempts[0].date,'2026-09-21');assert.equal(changedDate.dispatches[0].data.attemptHistory.JS1[0].date,'2026-10-17');
const missingPrior=replay([['LOG_REC_05390','JS1','23/09/2026','Entregado','Jorge Ramallo']],[['LOG_REC_05390','21/09/2026','Jorge Salcedo'],['LOG_REC_05395','23/09/2026','Jorge Ramallo']]);
assert.equal(missingPrior.attempts.length,0);assert.equal(missingPrior.issues[0].kind,'attempt_dispatch_unresolved');
console.log('PASS postponed histories, unique later dispatch, same-day completion, ambiguous and unsupported reassignment');
// Letter suffixes identify distinct physical dispatches, including owner-confirmed Osuna trip.
const suffixOrder=sourceRows([['LOG_REC_05395B','JS25575','23/09/2026','Entregado','Daniel Osuna']]);
const fee=['LOG_REC_05395B','23/09/2026','FLETE ENVIO EXPRES','Gasto','40.000'];fee[14]='Caja.EfectivoPesos';
const suffix=m.buildDispatchSource({logistics:suffixOrder,summary:[],follow:followRows([['LOG_REC_05395','23/09/2026','Jorge Ramallo']]),settlements:[],cash:[fee]},'2026-09-01','2026-09-30');
assert.equal(suffix.dispatches.length,2);assert.equal(suffix.attempts[0].code,'LOG_REC_05395B');assert.equal(suffix.movements[0].code,'LOG_REC_05395B');assert.equal(suffix.issues.length,0);
assert.equal(m.matchMovements(suffix.movements,[{...ledger,id:'osuna',date:'2026-09-23',amount:40000,concept:'FLETE ENVIO EXPRES'}],new Map()).links[0].code,'LOG_REC_05395B');
console.log('PASS suffix dispatch remains separate from Ramallo and links its own freight payment.');

const corrections=replay([['LOG_REC_05348','JS25242','10/09/2026','Entregado','Depósito'],['','AQ-FP00027','21/09/2026','Entregado','Pablo Lavayen'],['','AQ-FP00028','21/09/2026','Entregado','Pablo Lavayen'],['','CAMB1510','26/09/2026','Entregado','Depósito'],['','JS25691','29/09/2026','Entregado','Depósito'],['','JS25692','29/09/2026','Entregado','Depósito']],[['LOG_REC_05348','09/09/2026','Otro'],['LOG_REC_05391','21/09/2026','Pablo Lavayen'],['LOG_REC_05398','24/09/2026','Diego Weiss']]);
assert.equal(corrections.issues.length,0);assert.equal(corrections.attempts.length,2);assert(corrections.attempts.every(a=>a.code==='LOG_REC_05391'));assert.equal(corrections.dispatches.find(d=>d.code==='LOG_REC_05398').data.notDeparted,true);
console.log('PASS owner-confirmed pickups, Lavayen links and departure not performed.');

const octoberDispatch=followRows([['LOG_REC_05434','10/10/2026','Gustavo Gyv']]);const badDate=m.buildDispatchSource({logistics:sourceRows([['LOG_REC_05434','JS25760','10/09/2026','Anulado','Gustavo Gyv']]),summary:[],follow:octoberDispatch,settlements:[],cash:[]},'2026-09-01','2026-09-30');assert.equal(badDate.dispatches.length,0);assert.equal(badDate.attempts.length,0);assert.equal(badDate.issues[0].kind,'attempt_date_outside_dispatch');const actualMonth=m.buildDispatchSource({logistics:sourceRows([['LOG_REC_05434','JS25951','10/10/2026','Entregado','Gustavo Gyv']]),summary:[],follow:octoberDispatch,settlements:[],cash:[]},'2026-10-01','2026-10-31');assert.equal(actualMonth.dispatches.length,1);assert.equal(actualMonth.attempts[0].date,'2026-10-10');console.log('PASS month filter cannot recreate an October dispatch in September from a wrong order date.');
