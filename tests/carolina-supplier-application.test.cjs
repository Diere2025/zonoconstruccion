const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Map,Set,Number,Date,Intl,require:n=>imports[n]||{}});return exports;}
const text=load('src/lib/financialConcepts.ts'),guided=load('src/lib/financialClassification/guided.ts',{'@/lib/financialConcepts':text}),common=load('src/lib/financialOperations/commonMovement.ts',{'@/lib/financialConcepts':text,'@/lib/financialClassification/guided':guided});
const m=load('src/lib/financialOperations/supplierApplication.ts',{'./commonMovement':common,'@/lib/financialClassification/guided':guided});
const input={operation_type:'general',direction:'egreso',effective_date:'2026-10-26',account_id:'account',payment_method_id:'method',amount:'909000.00',concept:'TAM',category:'Proveedores',financial_concept_id:'tam',notes:'Referencia bancaria existente',detail:{automatic:true,reference:'bank-ref'}};
const concept={id:'tam',concept:'TAM',category:'Proveedores',movement_type:'Egreso',sub_category:'',efe_category:'Pago a proveedores',is_active:true};
const result=m.supplierApplicationInput(input,[concept],[{id:'supplier-tam',name:'TAM'}]);
assert.equal(result.operation_type,'supplier_payment');assert.equal(result.supplier_id,'supplier-tam');assert.equal(result.detail.supplier_allocation_mode,'documents');
for(const k of ['amount','account_id','payment_method_id','effective_date','notes','concept'])assert.equal(result[k],input[k]);assert.equal(result.detail.reference,'bank-ref');assert.equal(result.detail.automatic,true);assert.equal(input.operation_type,'general');
assert.equal(m.supplierApplicationInput(input,[concept],[{id:'one',name:'TAM'},{id:'two',name:'TAM'}]).supplier_id,undefined);
assert.throws(()=>m.supplierApplicationInput({...input,direction:'ingreso'},[],[]),/egreso/);
console.log('PASS supplier application preserves money, date and bank reference, defaults explicit documents, resolves only unique suppliers, and rejects incomes.');
