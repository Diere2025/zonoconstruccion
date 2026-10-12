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
