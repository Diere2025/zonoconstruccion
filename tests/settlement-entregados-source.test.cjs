const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function load(file,imports={},extra={}){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out,URL,Map,Set,Date,Number,String,JSON,Intl,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}},console,require:n=>imports[n]||{},...extra});return out;}
const h=load('src/lib/logisticsDispatch/settlementSource.ts');
const option={code:'LOG_REC_05433',delivery_date:'2026-10-10',carrier_name:'Ramallo'};
assert.doesNotThrow(()=>h.deliveredSourceOnly('entregados'));assert.throws(()=>h.deliveredSourceOnly('entregando'),/ya no se importa/);
assert.equal(h.assignedDispatchCode('LOG_REC_05433','',undefined,[],option,'2026-10-10'),'LOG_REC_05433');
assert.equal(h.assignedDispatchCode('','',option.code,[option],option,'2026-10-10'),option.code);
assert.equal(h.assignedDispatchCode('','',' log_rec_05395b ',[],null,'2026-09-23'),'LOG_REC_05395B');
assert.throws(()=>h.assignedDispatchCode('','',undefined,[option],null,'2026-10-10'),/Asigná/);
assert.throws(()=>h.assignedDispatchCode('','',option.code,[],option,'2026-10-10'),/fletero/);
assert.throws(()=>h.assignedDispatchCode('','',option.code,[option],option,'2026-10-11'),/fecha/);
assert.throws(()=>h.assignedDispatchCode(option.code,'','LOG_REC_05434',[option],option,'2026-10-10'),/cambió/);
let reads=0,writes=0;
const db={auth:{getUser:async()=>({data:{user:{id:'laura',email:'fixture@example.invalid',user_metadata:{}}},error:null})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'laura',role:'administracion',roles:['administracion'],is_active:true},error:null}),insert:()=>{writes++;return q;},update:()=>{writes++;return q;},upsert:()=>{writes++;return q;}};return q;}};
const api=load('src/app/api/admin/rendiciones/route.ts',{'@/lib/logisticsDispatch/identityCorrectionServer':{projectCorrectedDeliveredRows:async(db,rows)=>rows},'@supabase/supabase-js':{createClient:()=>db},'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}},'@/lib/logisticsDispatch/settlementSource':h,'@/lib/googleSheets':{fetchSpreadsheetValues:async(id,range)=>{reads++;assert.equal(range,"'🔴 Entregados'!A2:CO");return []}}});
const request=(url,body)=>({url:'https://fixture.invalid/api/admin/rendiciones'+url,headers:{get:()=> 'Bearer fixture'},json:async()=>body});
(async()=>{assert.equal((await api.GET(request('?action=preview-entregando&source=entregando'))).status,400);assert.equal(reads,0);assert.equal((await api.GET(request('?action=preview-entregados&date=2026-10-10'))).status,200);assert.equal(reads,1);assert.equal((await api.POST(request('',{action:'confirm-entregando',items:[{source:'entregando'}]}))).status,400);assert.equal(writes,0);console.log('PASS Laura can read Entregados through CO; Entregando rejected before reading/writing; manual assignment, suffix, date/fletero mismatch and stale source validated.');})().catch(e=>{console.error(e);process.exitCode=1});

const a={key:'one',carrierName:'Pablo Lavayen',deliveryDate:'2026-10-10',runNumber:1,dispatchCode:'LOG_REC_05431',orders:[{orderCode:'JS1',sourceRow:1}],totalAmount:10};
const b={...a,key:'two',carrierName:'Lavayen Pablo',dispatchCode:'',orders:[{orderCode:'JS2',sourceRow:2}],totalAmount:20};
const c={...a,key:'three',runNumber:2,orders:[{orderCode:'JS3',sourceRow:3}]};
const merged=h.mergeDeliveredGroups([a,b,c],()=> 'pablo',orders=>orders.length*10);
assert.equal(merged.length,2);assert.equal(merged[0].orders.length,2);assert.equal(merged[0].dispatchCode,merged[1].dispatchCode);
const conflicting=h.mergeDeliveredGroups([a,{...b,dispatchCode:'LOG_REC_05432'}],()=> 'pablo',()=>0);assert(conflicting.every(g=>g.sourceIssue));
console.log('PASS alias and missing-row codes merge without duplicating orders; R1/R2 stay separate under one LOG; conflicting source LOGs require review.');

const row=Array(93).fill('');row[0]='JS1';row[1]='2026-10-10';row[79]='Pablo';
const stored=[{code:'LOG_REC_05431',date:'2026-10-10',carrierName:'Pablo',orderCode:'JS1'}];
const applied=h.applyStoredDispatchAssignments([row],stored,x=>String(x),(a,b)=>a===b);assert.equal(applied.values[0][92],'LOG_REC_05431');assert.equal(row[92],'');assert.deepEqual(Array.from(applied.assignedRows),[3]);
const explicit=[...row];explicit[92]='LOG_REC_05432';assert.equal(h.applyStoredDispatchAssignments([explicit],stored,x=>String(x),(a,b)=>a===b).values[0][92],'LOG_REC_05432');
const ambiguous=[...stored,{...stored[0],code:'LOG_REC_05432'}];assert.equal(h.applyStoredDispatchAssignments([row],ambiguous,x=>String(x),(a,b)=>a===b).assignedRows.length,0);
assert.equal(h.applyStoredDispatchAssignments([row],[{...stored[0],date:'2026-10-11'}],x=>String(x),(a,b)=>a===b).assignedRows.length,0);
console.log('PASS persisted LOG fills missing source in read projection without changing Sheets; explicit corrections win; ambiguous or wrong-date assignments remain unresolved.');
