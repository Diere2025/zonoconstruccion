const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name]});return exports;}
const guided=load('src/lib/financialClassification/guided.ts'),{personalExtractionShortcut:shortcut}=load('src/lib/financialClassification/personalShortcut.ts',{'./guided':guided});
const concept={id:'personal',is_active:true,movement_type:'Egreso',classification:{category:'Extracciones',person:'Diego Bóveda',concept:'Extracción personal',detail:'',destination:''}};
test('personal extraction shortcut belongs only to Diego and requires an unambiguous active outgoing option',()=>{
 assert.equal(shortcut('diego.boveda@gmail.com',[concept]),'personal');
 for(const email of [undefined,'caroibarra.93@gmail.com','otro@gmail.com'])assert.equal(shortcut(email,[concept]),null);
 for(const concepts of [[],[{...concept,is_active:false}],[{...concept,movement_type:'Ingreso'}],[concept,{...concept,id:'duplicate'}],[{...concept,classification:{...concept.classification,person:'Carolina Ibarra'}}]])assert.equal(shortcut('diego.boveda@gmail.com',concepts),null);
});
