const {test}=require('node:test'),assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(source,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Set,Map,Number,String,Math,...globals});return exports;}
const sync=load(fs.readFileSync('src/lib/orderSync.ts','utf8'));
const paths=['src/app/admin/importar-pedidos/page.tsx','src/app/api/admin/import-job/route.ts','src/lib/unimportedOrders.ts'];
const normalizeText=v=>String(v||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const parseSpanishNumber=v=>Number(String(v||'0').replace(/[^0-9.,-]/g,'').replace(/\./g,'').replace(',','.'))||0;
const mergers=paths.map(path=>{const source=fs.readFileSync(path,'utf8'),fn=source.match(/const mergeContiguousSheetRows = \(rows: string\[\]\[\]\): string\[\]\[\] => \{[\s\S]*?\n\s{0,2}\};/)?.[0];assert(fn,path);return {path,merge:load('export '+fn,{...sync,normalizeText,parseSpanishNumber}).mergeContiguousSheetRows};});
function row(code,amount='100'){const r=Array(38).fill('');Object.assign(r,{0:'Pendiente',1:code,3:'26/10/2026',5:'Cliente',18:'Dirección 123',24:'0',25:'0',27:'0',28:amount,29:amount,30:'Tanque',31:'1',32:amount,33:amount});return r;}
const header=()=>Array(38).fill('Cabecera');
test('recognizes wholesale and existing prefixes, chains three continuations, and rejects mixed, repeated or nonconsecutive identities',()=>{
 for(const [a,b] of [['AQ-FP00040','AQ-FP00041'],['AQ-001','AQ-002'],['AQU100','AQU101'],['JS100','JS101'],['AQ-FP00040 / AQ-FP00041','AQ-FP00042']])assert.equal(sync.consecutiveOrderCodes(a,b),true);
 for(const [a,b] of [['AQ-FP00040','AQ-FA00041'],['AQ-FP00040','AQ-FP00042'],['AQ-FP00040','AQ-FP00040'],['AQ-FP00040 / AQ-FP00041','AQ-FP00040'],['AQ-FP00040x','AQ-FP00041'],['','AQ-FP00041']])assert.equal(sync.consecutiveOrderCodes(a,b),false);
});
for(const {path,merge} of mergers){
 test(path+': merges the full wholesale row with discount, retains every line and centavos without mutating input',()=>{const first=row('AQ-FP00040','1.234,56'),second=row('AQ-FP00041','20,50');Object.assign(second,{34:'Descuento Compra Mayorista',35:'1',36:'-10,25',37:'-10,25'});const source=[header(),first,second],before=JSON.stringify(source),result=merge(source);assert.equal(result.length,2);assert.equal(result[1][1],'AQ-FP00040 / AQ-FP00041');assert.equal(parseSpanishNumber(result[1][28]),1255.06);assert.equal(result[1].filter(v=>v==='Tanque').length,2);assert.ok(result[1].includes('Descuento Compra Mayorista'));assert.ok(result[1].includes('-10,25'));assert.equal(sync.hasCompleteOrderCodes(result[1][1],'AQ-FP00040 / AQ-FP00041'),true);assert.equal(JSON.stringify(source),before);});
 test(path+': different customer, date, address or prefix remains separated',()=>{for(const [index,value] of [[5,'Otro cliente'],[3,'27/10/2026'],[18,'Otra dirección'],[1,'AQ-FA00041']]){const second=row('AQ-FP00041');second[index]=value;assert.equal(merge([header(),row('AQ-FP00040'),second]).length,3);}});
 test(path+': entire three-row continuation stays together before batch slicing',()=>{const result=merge([header(),row('AQ-FP00040'),row('AQ-FP00041'),row('AQ-FP00042')]);assert.equal(result.length,2);assert.equal(result[1][1],'AQ-FP00040 / AQ-FP00041 / AQ-FP00042');assert.equal(parseSpanishNumber(result[1][28]),300);});
}
module.exports={mergers,sync,parseSpanishNumber};
