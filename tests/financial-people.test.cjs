const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildSeed,key}=require('../scripts/financial-people-seed.cjs');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function manager(initial,request){let cursor=0;const state=[...initial];const hooks={...React,useState:value=>{const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect:()=>{},useRef:value=>({current:value})};const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/finanzas/operations/PeopleManager.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,crypto:globalThis.crypto,require:n=>n==='react'?hooks:n==='@/lib/supabase'?{supabase:{}}:n==='@/lib/authenticatedRequest'?{createAuthenticatedRequester:()=>request}:n==='@/components/ui/AdaptiveSelect'?{__esModule:true,default:'select'}:require(n)});return{render:()=>{cursor=0;return exports.default({onClose:()=>{},onChanged:()=>{}});},state};}
function findAll(tree,predicate){if(!tree||typeof tree!=='object')return[];return [...(predicate(tree)?[tree]:[]),...React.Children.toArray(tree.props?.children).flatMap(c=>findAll(c,predicate))];}
const person={id:'00000000-0000-0000-0000-000000000001',full_name:'Persona activa',kinds:['employee'],employee_id:'00000000-0000-0000-0000-000000000002',cuit:null,role:null,base_salary:0,is_active:true,version:1,last_used_at:null};
test('register hides disabled people by default and read-only users cannot create',()=>{
 const m=manager([[person,{...person,id:'disabled',full_name:'Persona inactiva',is_active:false}],'',false,false,'',false,false],()=>{throw Error('No request expected');});const tree=m.render();
 assert.equal(findAll(tree,e=>e.type==='p'&&e.props.children==='Persona inactiva').length,0);
 assert.equal(findAll(tree,e=>e.type==='button'&&e.props.children==='Nuevo registro')[0].props.disabled,true);
 findAll(tree,e=>e.type==='input'&&e.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
 assert.equal(findAll(m.render(),e=>e.type==='p'&&e.props.children==='Persona inactiva').length,1);
});
test('enable or disable saves the reviewed version and reason through the authenticated API',async()=>{
 const calls=[];const request=async(url,options)=>{calls.push({url,options});return options?{person}:{people:[person],can_write:true};};
 const data={full_name:person.full_name,kinds:person.kinds,cuit:'',role:'',base_salary:'',is_active:true};
 const m=manager([[person],'',false,true,'',false,false,person,data,'Baja confirmada'],request);let tree=m.render();
 findAll(tree,e=>e.type==='input'&&e.props.type==='checkbox'&&e.props.checked===true)[0].props.onChange({target:{checked:false}});tree=m.render();
 await findAll(tree,e=>e.type==='form')[0].props.onSubmit({preventDefault(){}});
 const body=JSON.parse(calls.find(c=>c.options)?.options.body);assert.equal(body.data.is_active,false);assert.equal(body.id,person.id);assert.equal(body.version,1);assert.equal(body.reason,'Baja confirmada');assert.match(body.key,/^[0-9a-f-]{36}$/);assert.equal(m.state[7],undefined);
});
const c=(id,concept,category='Sueldos',sub_category='Sueldos y Jornales')=>({id,concept,category,sub_category});
test('confirmed aliases preserve concepts while combining people and recent usage',()=>{
 const source={employees:[],carriers:[],concepts:[c('a','OLIVERA, MATIAS'),c('b','OLIVERA, MATIAS NAHUEL'),c('c','VEGA, MATIAS RICARDO'),c('d','VEGA, MATÍAS (COMBUSTIBLE)','Servicio de Flete'),c('e','Monotributo Mariano Bravo'),c('f','BRAVO, MARIANO ERNESTO')],movements:[{financial_concept_id:'a',created_at:'2026-09-01'},{financial_concept_id:'d',created_at:'2026-09-02'}]};
 const p=buildSeed(source);assert.equal(p.length,3);const olivera=p.find(x=>key(x.full_name)===key('OLIVERA, MATIAS NAHUEL'));assert.deepEqual(olivera.concept_ids,['a','b']);assert.equal(olivera.is_active,true);const vega=p.find(x=>x.full_name.includes('VEGA'));assert.deepEqual(vega.kinds,['employee']);assert.equal(vega.is_active,true);assert.equal(p.find(x=>x.full_name.includes('BRAVO')).is_active,false);
});
test('retired person stays disabled; carrier duplicates and service classifications merge correctly',()=>{
 const p=buildSeed({employees:[],concepts:[c('a','GIANLUCA, VALLARINO','Servicio de Flete')],carriers:[{id:'b',name:'Sergio Radice'},{id:'c',name:'Sergio Radice (Claudio Cipriano)'},{id:'d',name:'Pato'},{id:'e',name:'GYV'},{id:'f',name:'Furgón Reparto Chico 2'},{id:'g',name:'Furgón Reparto Chico 2'}],movements:[{financial_concept_id:'a',created_at:'2026-09-01'}]});
 assert.equal(p.find(x=>x.full_name.includes('GIANLUCA')).is_active,false);assert.equal(p.find(x=>x.full_name==='Sergio Radice').carrier_ids.length,2);assert.deepEqual(p.find(x=>x.full_name==='Pato').kinds,['cleaning']);assert.deepEqual(p.find(x=>x.full_name==='GYV').kinds,['transport']);assert.equal(p.find(x=>x.full_name==='Furgón Reparto Chico 2').carrier_ids.length,2);
});
