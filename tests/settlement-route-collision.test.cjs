const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const m={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/logisticsDispatch/settlementRoute.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:m,Number,Error});
const ramallo='9945004e-8408-4d2d-886a-ae0d5dc17cda',salcedo='1eee775d-2242-4aba-8f49-d76d0ed97ef0',date='2026-10-24';
const original={id:'ramallo-route',carrier_id:ramallo,delivery_date:date,run_number:1,code:'HR-20261024-JOR-R1',total_theoretical_cash:4669380,status:'Confirmada'};
const input={carrierId:salcedo,deliveryDate:date,runNumber:1,total:3126666,hasAssistant:true};
function mock({race=false,collision=false,error=null}={}){
 const routes=[{...original}];let inserts=0;
 const db={from(table){assert.equal(table,'route_sheets');let filters=[],payload;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},insert(row){inserts++;payload=row;return q},async maybeSingle(){return {data:routes.find(r=>filters.every(([k,v])=>r[k]===v))||null,error:null}},async single(){if(error)return {error};if(collision)return {error:{code:'23505',message:'Other code collision'}};const row={id:'salcedo-route',...payload};routes.push(row);return race?{error:{code:'23505'}}:{data:row,error:null}}};return q}};
 return {db,routes,inserts:()=>inserts};
}
(async()=>{
 assert.notEqual(m.settlementRouteCode(ramallo,date,1),m.settlementRouteCode(salcedo,date,1));
 assert.notEqual(m.settlementRouteCode(salcedo,date,1),m.settlementRouteCode(salcedo,date,2));
 assert.notEqual(m.settlementRouteCode(salcedo,date,1),m.settlementRouteCode(salcedo,'2026-10-25',1));
 assert.equal(m.settlementRouteCode(salcedo.toUpperCase(),date,1),m.settlementRouteCode(salcedo,date,1));
 assert.throws(()=>m.settlementRouteCode('Jorge',date,1),/Fletero inválido/);
 const a=mock(),before=JSON.stringify(a.routes[0]);
 const route=await m.ensureSettlementRoute(a.db,input);assert.equal(route.id,'salcedo-route');assert.equal(a.routes.length,2);assert.equal(JSON.stringify(a.routes[0]),before);
 assert.equal((await m.ensureSettlementRoute(a.db,input)).id,route.id);assert.equal(a.inserts(),1);
 const old=await m.ensureSettlementRoute(a.db,{...input,carrierId:ramallo,total:0});assert.equal(old.code,original.code);assert.equal(JSON.stringify(a.routes[0]),before);
 await assert.rejects(()=>m.ensureSettlementRoute(a.db,{...input,existingRouteSheetId:'ramallo-route'}),/ya no corresponde/);assert.equal(a.inserts(),1);
 const concurrent=mock({race:true});assert.equal((await m.ensureSettlementRoute(concurrent.db,input)).id,'salcedo-route');assert.equal(concurrent.routes.length,2);
 const other=mock({collision:true});await assert.rejects(()=>m.ensureSettlementRoute(other.db,input),e=>e.code==='23505');assert.equal(other.routes.length,1);
 const unavailable=mock({error:{code:'42501'}});await assert.rejects(()=>m.ensureSettlementRoute(unavailable.db,input),e=>e.code==='42501');
 console.log('PASS INC-005192: Salcedo and Ramallo have distinct codes, confirmed routes preserved, retries reuse exact identity, concurrent creation recovered, wrong identity and unrelated conflicts rejected.');
})().catch(e=>{console.error(e);process.exitCode=1});
