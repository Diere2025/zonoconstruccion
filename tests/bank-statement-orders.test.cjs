const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name],Date,Intl,Map,Set,BigInt,Number,Error,Array});return exports;}
const model=load('src/lib/bankStatements/model.ts'),linking=load('src/lib/bankStatements/orderLinks.ts',{'./model':model});
test('only collection sources and positive collection concepts allow order linking',()=>{
 const concepts=[{id:'collection',concept:'Cobro',category:'Recaudación'},{id:'investment',concept:'MP - Intereses Ganados',category:'Inversiones'}];
 for(const description of ['Cobro','Ingreso de dinero','Dinero recibido'])assert.equal(linking.isStatementCollection({description,signed_amount:'1.00',financial_concept_id:null},concepts),true);
 for(const [description,signed_amount,financial_concept_id]of [['Cobro','-1.00',null],['Cobro','0.00',null],['Rendimiento positivo de la inversión','1.00',null],['Costo de Mercado Pago','-1.00',null],['Cobro','1.00','investment']])assert.equal(linking.isStatementCollection({description,signed_amount,financial_concept_id},concepts),false);
 assert.equal(linking.isStatementCollection({description:'Otro cobro validado',signed_amount:'1.00',financial_concept_id:'collection'},concepts),true);
});

const operation=load('src/lib/bankStatements/operationOrder.ts');
const base=(id,more={})=>({id,related_operation_id:'OP1',signed_amount:'-10.00',description:'Costo de Mercado Pago',order_link:null,...more});
const linked=(id,order='A',stale=false)=>base(id,{signed_amount:'100.00',order_link:{order_id:order,code:'PED-'+order,stale}});
test('operation reference follows the collection without making fees into linked collections',()=>{const input=[linked('receipt'),base('fee'),base('tax')];const result=operation.withOperationOrder(input);assert.equal(result[1].operation_order.code,'PED-A');assert.equal(result[1].operation_order.entry_id,'receipt');assert.equal(result[1].order_link,null);assert.equal(input[1].operation_order,undefined);assert.equal(result[1].signed_amount,'-10.00');});
test('removed and stale collection links clear every shared reference',()=>{for(const receipt of [base('receipt'),linked('receipt','A',true)]){const result=operation.withOperationOrder([receipt,base('fee',{operation_order:{code:'OLD'}})]);assert.equal(result[1].operation_order,null);}});
test('conflicting orders are flagged and reserve operations do not inherit an order',()=>{const result=operation.withOperationOrder([linked('receipt'),linked('other','B'),base('fee'),base('reserve',{activity_context:{kind:'reserve_transfer'}}),base('unrelated',{related_operation_id:'OP2'})]);assert.equal(result[2].operation_order.ambiguous,true);assert.equal(result[2].operation_order.code,null);assert.equal(result[3].operation_order,null);assert.equal(result[4].operation_order,null);});
