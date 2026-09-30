const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');const {test}=require('node:test');const assert=require('node:assert/strict');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name]});return exports;}
const types=load('src/lib/support/types.ts');const {administrativeEventContext}=load('src/lib/support/eventContext.ts',{'./types':types});
const me={sectors:[{id:'it',name:'TI / Sistemas'}],people:[{id:'diego',name:'Diego Bóveda'}]};
test('a transfer explains the destination and responsible person alongside its reason',()=>{
 const event={kind:'transfer',details:{sector_id:'it',assignee_id:'diego'},message:{body:'error de carga'}};
 assert.equal(administrativeEventContext(event,me),'Área responsable: TI / Sistemas. Responsable: Diego Bóveda.');
 assert.equal(event.message.body,'error de carga');
});
test('assignment distinguishes team responsibility from an individual',()=>{
 assert.equal(administrativeEventContext({kind:'assign',details:{sector_id:'it',assignee_id:null}},me),'Responsable: Equipo de TI / Sistemas.');
 assert.equal(administrativeEventContext({kind:'take',details:{assignee_id:'diego'}},me),'Responsable: Diego Bóveda.');
 assert.equal(administrativeEventContext({kind:'message',details:{}},me),null);
});
