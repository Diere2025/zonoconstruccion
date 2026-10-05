const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function load(file,imports={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>imports[name] || require(name),Date,console});return exports;
}
const types=load('src/lib/financialOperations/types.ts');
const validation=load('src/lib/financialOperations/validation.ts',{'./types':types});
const defaults=load('src/lib/financialOperations/transferDefaults.ts');
const {prepareTransfer}=load('src/lib/financialOperations/transferInput.ts',{'./validation':validation});
const fields=load('src/components/finanzas/operations/OperationFields.tsx',{'@/components/ui/AdaptiveSelect':{__esModule:true,default:()=>null}});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const base={operation_type:'operating_expense',effective_date:'2026-10-01',account_id:id(1),payment_method_id:id(2),direction:'egreso',amount:'100.00',category:'Gastos Operativos',concept:'Prueba válida',detail:{}};
test('transfer saves without a user-selected method and removes inherited business classifications',()=>{
 const input={...base,operation_type:'internal_transfer',destination_account_id:id(3),payment_method_id:'',cost_center_id:id(4),route_sheet_id:id(5),financial_concept_id:id(6),category:'Sueldos',detail:{beneficiary:'Persona'}};
 const prepared=prepareTransfer(input,[{id:id(7),name:'Transferencia (10%)'},{id:id(8),name:'Transferencia'}]);
 validation.validateOperation(prepared);assert.equal(prepared.payment_method_id,id(8));assert.equal(prepared.category,'Movimiento de cuentas');assert.equal(prepared.cost_center_id,undefined);assert.equal(prepared.route_sheet_id,undefined);assert.equal(prepared.financial_concept_id,undefined);assert.equal(Object.keys(prepared.detail).length,0);assert.equal(input.category,'Sueldos');
 assert.throws(()=>prepareTransfer(input,[{id:id(7),name:'Transferencia (10%)'}]),/medio técnico/);
 assert.equal(prepareTransfer(base,[]),base);
});
function find(tree,predicate){if(!tree || typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const hit=find(child,predicate);if(hit)return hit;}return null;}
test('money rejects nonfinite, negative, excessive precision and invalid business date',()=>{
 for(const amount of ['NaN','Infinity','0','-1','1.001','1e3'])assert.throws(()=>validation.validateOperation({...base,amount}));
 assert.throws(()=>validation.validateOperation({...base,effective_date:'2026-02-30'}));validation.validateOperation(base);
});
test('supplier allocations cannot exceed total or repeat a document',()=>{
 const value={...base,operation_type:'supplier_payment',supplier_id:id(3)};
 assert.throws(()=>validation.validateOperation({...value,allocations:[{purchase_id:id(4),amount:'101'}]}));
 assert.throws(()=>validation.validateOperation({...value,allocations:[{purchase_id:id(4),amount:'10'},{purchase_id:id(4),amount:'10'}]}));
 validation.validateOperation({...value,allocations:[{purchase_id:id(4),amount:'40'}]});
});
test('eventual purchases allow optional merchant but reject supplier and invoice links',()=>{
 const value={...base,operation_type:'supplier_payment',category:'Proveedores',detail:{supplier_kind:'eventual'}};
 validation.validateOperation(value);
 validation.validateOperation({...value,detail:{...value.detail,supplier_name:'Ferretería'}});
 assert.throws(()=>validation.validateOperation({...value,supplier_id:id(3)}));
 assert.throws(()=>validation.validateOperation({...value,allocations:[{purchase_id:id(4),amount:'10'}]}));
 assert.throws(()=>validation.validateOperation({...value,detail:{supplier_kind:'invalid'}}));
 assert.throws(()=>validation.validateOperation({...value,operation_type:'operating_expense'}));
 assert.throws(()=>validation.validateOperation({...value,detail:{}}));
});
test('eventual purchase form hides supplier and advance controls and clears links when switching',()=>{
 const {renderToStaticMarkup}=require('react-dom/server');
 const eventual={...base,operation_type:'supplier_payment',detail:{supplier_kind:'eventual'},allocations:[]};
 const tree=fields.SupplierFields({value:eventual,onChange:()=>{},suppliers:[],purchases:[]});
 const html=renderToStaticMarkup(tree);
 assert.ok(html.includes('Comercio / proveedor (opcional)'));
 assert.ok(!html.includes('Anticipo sin imputar:'));
 assert.ok(!html.includes('Proveedor de la operación'));
 const registered={...eventual,supplier_id:id(3),allocations:[{purchase_id:id(4),amount:'10'}],detail:{}};let changed;
 const controls=fields.SupplierFields({value:registered,onChange:v=>changed=v,suppliers:[],purchases:[]});
 const variant=controls.props.children[0].props.children[1];
 variant.props.onChange({target:{value:'eventual'}});
 assert.equal(changed.supplier_id,undefined);assert.equal(changed.allocations.length,0);assert.equal(changed.detail.supplier_kind,'eventual');
});
test('payroll and tax require period and identified beneficiary or organism',()=>{
 assert.throws(()=>validation.validateOperation({...base,operation_type:'payroll_payment',detail:{period:'2026-10',payroll_kind:'advance'}}));
 validation.validateOperation({...base,operation_type:'payroll_payment',detail:{period:'2026-10',payroll_kind:'advance',beneficiary:'Eventual'}});
 assert.throws(()=>validation.validateOperation({...base,operation_type:'tax_payment',detail:{period:'2026-13',organism:'ARCA'}}));
 validation.validateOperation({...base,operation_type:'tax_payment',detail:{period:'2026-10',organism:'ARCA'}});
});
test('choosing employee for an advance preserves the explicitly entered amount',()=>{
 let changed;const value={...base,operation_type:'payroll_payment',detail:{period:'2026-10',payroll_kind:'advance'}};
 const tree=fields.PersonnelFields({value,onChange:v=>changed=v,employees:[{id:id(3),full_name:'Prueba',base_salary:900000}]});
 find(tree,e=>e.props?.['aria-label']==='Empleado').props.onChange({target:{value:id(3)}});
 assert.equal(changed.amount,'100.00');assert.equal(changed.employee_id,id(3));
 assert.equal(find(tree,e=>e.type==='button'),null);
});
test('changing supplier clears allocations from the previous supplier',()=>{
 let changed;const tree=fields.SupplierFields({value:{...base,supplier_id:id(3),allocations:[{purchase_id:id(4),amount:'40'}]},onChange:v=>changed=v,suppliers:[],purchases:[]});
 find(tree,e=>e.props?.['aria-label']==='Proveedor de la operación').props.onChange({target:{value:id(5)}});
 assert.equal(changed.supplier_id,id(5));assert.equal(changed.allocations.length,0);assert.equal(changed.amount,'100.00');
});
test('transfer preserves reviewed MP2 to MP1 defaults and excludes inactive or different currency accounts',()=>{
 const accounts=[{id:'usd',name:'USD',currency:'USD',is_active:true},{id:'mp2',name:'Cuenta MP2',currency:'ARS',is_active:true},{id:'mp1',name:'Cuenta MP1',currency:'ARS',is_active:true}];
 assert.equal(defaults.transferDefaults(accounts).account_id,'mp2');assert.equal(defaults.transferDefaults(accounts).destination_account_id,'mp1');
 assert.equal(defaults.transferDefaults(accounts.map(a=>a.id==='mp1'?{...a,is_active:false}:a)).destination_account_id,'');
});
test('stored operation identity wins over inherited accounting category',()=>{
 assert.equal(types.inferOperationType({category:'Sueldos',type:'egreso',financial_operations:{operation_type:'general'}}),'general');
});
test('financial access derives actor from verified session and enforces write permission',async()=>{
 const exports={};let permissionCall;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/financialOperations/server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'}},
  require:name=>name==='@supabase/supabase-js'?{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:id(9)}},error:null})},rpc:async(name,args)=>{permissionCall={name,args};return {data:false,error:null};}})}:validation
 });
 await assert.rejects(exports.financialContext(new Request('https://example.test'),true),e=>e.status===401);
 await assert.rejects(exports.financialContext(new Request('https://example.test',{headers:{Authorization:'Bearer test'}}),true),e=>e.status===403);
 assert.equal(permissionCall.name,'can_manage_financial_operations');assert.equal(permissionCall.args.p_user_id,id(9));
});
