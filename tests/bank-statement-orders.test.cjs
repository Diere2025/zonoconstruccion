const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name],Date,Intl,Map,Set,BigInt,Number,Error,Array});return exports;}
const model=load('src/lib/bankStatements/model.ts'),linking=load('src/lib/bankStatements/orderLinks.ts',{'./model':model});
test('only collection sources and positive collection concepts allow order linking',()=>{
 const concepts=[{id:'collection',concept:'Cobro',category:'Recaudación'},{id:'investment',concept:'MP - Intereses Ganados',category:'Inversiones'}];
 for(const description of ['Cobro','Ingreso de dinero','Dinero recibido'])assert.equal(linking.isStatementCollection({description,signed_amount:'1.00',financial_concept_id:null},concepts),true);
 for(const [description,signed_amount,financial_concept_id]of [['Cobro','-1.00',null],['Cobro','0.00',null],['Rendimiento positivo de la inversión','1.00',null],['Costo de Mercado Pago','-1.00',null],['Cobro','1.00','investment']])assert.equal(linking.isStatementCollection({description,signed_amount,financial_concept_id},concepts),false);
 assert.equal(linking.isStatementCollection({description:'Otro cobro validado',signed_amount:'1.00',financial_concept_id:'collection'},concepts),true);
});
