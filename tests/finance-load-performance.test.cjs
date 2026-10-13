const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Intl,require:n=>imports[n]});return exports;}
const time=load('src/lib/treasuryTransactionTime.ts');
const {financeDateRange}=load('src/lib/financeDateRange.ts',{'./treasuryTransactionTime':time});
const batching=load('src/lib/financialOperations/readBatches.ts');
test('default seven days include today in Buenos Aires across UTC midnight and year boundary',()=>{
 const period=financeDateRange('7dias',new Date('2026-01-01T01:30:00Z'));
 assert.equal(period.start,'2025-12-25');assert.equal(period.end,'2025-12-31');
 assert.equal(financeDateRange('30dias',new Date('2026-10-13T12:00:00Z')).start,'2026-09-14');
 assert.equal(financeDateRange('mes',new Date('2026-10-01T01:00:00Z')).start,'2026-09-01');
});
test('bounded overlapping batches retain all IDs and propagate read failures',async()=>{
 const ids=Array.from({length:501},(_,i)=>i),seen=[];let active=0,max=0;
 await batching.readBatches(ids,async chunk=>{active++;max=Math.max(max,active);assert.ok(chunk.length<=100);await new Promise(r=>setImmediate(r));seen.push(...chunk);active--;});
 assert.equal(max,2);assert.deepEqual(seen.sort((a,b)=>a-b),ids);
 await assert.rejects(batching.readBatches(ids,async()=>{throw new Error('database timeout');}),/database timeout/);
});
test('classification reads retain every batch',async()=>{
 const ids=Array.from({length:201},(_,i)=>'t'+i);
 const snapshots=load('src/lib/financialClassification/server.ts',{'../financialOperations/readBatches':batching});

 const rows=Array.from({length:501},(_,i)=>({id:'a'+i,cash_transaction_id:'t200',operation_id:'op',amount:1,financial_operations:{status:'posted',detail:{input:{counterparty:'Socio'}}}}));
 const db={from(table){let selected=[];return {select(){return this;},in(key,values){selected=values;return this;},is(){return this;},order(){return this;},then(resolve){resolve({data:selected.map(transaction_id=>({transaction_id,value:{label:transaction_id}})),error:null});},async range(a,b){return {data:rows.filter(r=>selected.includes(r.cash_transaction_id)).slice(a,b+1),error:null};}};}};
 const classifications=await snapshots.movementClassifications(db,ids);
 assert.equal(classifications.size,201);assert.equal(classifications.get('t200').label,'t200');

});
test('optimized date ordering retains accounting day, registration time and ID tie breaks',()=>{
 const rows=[{id:'b',created_at:'2026-10-02T02:30:00Z',registered_at:'2026-10-03T15:00:00Z'},{id:'a',created_at:'2026-10-01T12:00:00Z',registered_at:'2026-10-03T15:00:00Z'},{id:'c',created_at:'2026-10-02T12:00:00Z',registered_at:'2026-10-02T12:00:00Z'}];
 assert.deepEqual(rows.sort(time.compareTreasuryTransactions).map(r=>r.id),['a','b','c']);
});
