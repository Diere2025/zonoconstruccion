const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function load(file,imports={},globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>imports[name] || require(name),Date,console,...globals});return exports;
}
const types=load('src/lib/financialOperations/types.ts');
const validation=load('src/lib/financialOperations/validation.ts',{'./types':types});
const defaults=load('src/lib/financialOperations/transferDefaults.ts');
const {prepareTransfer}=load('src/lib/financialOperations/transferInput.ts',{'./validation':validation});
const formDefaults=load('src/lib/financialOperations/formDefaults.ts',{'./types':types,'./validation':validation,'./transferInput':{prepareTransfer}});
const fields=load('src/components/finanzas/operations/OperationFields.tsx',{'@/components/ui/AdaptiveSelect':{__esModule:true,default:()=>null},'./SupplierDocuments':{__esModule:true,default:()=>null},'./SupplierPicker':{__esModule:true,default:()=>null}});
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
 find(tree,e=>Array.isArray(e.props?.suppliers)).props.onChange(id(5));
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

test('verified mutation actor avoids a permission network call; missing and invalid tokens still fail',async()=>{
 let authCalls=0,rpcCalls=0;
 const server=load('src/lib/financialOperations/server.ts',{'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async(token)=>{authCalls++;return token==='valid'?{data:{user:{id:id(9)}},error:null}:{data:{user:null},error:{status:401}};}},rpc:async()=>{rpcCalls++;return {data:true,error:null};}})},'./validation':validation},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test'}}});
 await assert.rejects(server.financialMutationContext(new Request('https://example.test')),e=>e.status===401);
 await assert.rejects(server.financialMutationContext(new Request('https://example.test',{headers:{Authorization:'Bearer bad'}})),e=>e.status===401);
 const context=await server.financialMutationContext(new Request('https://example.test',{headers:{Authorization:'Bearer valid'}}));assert.equal(context.actor,id(9));assert.equal(authCalls,2);assert.equal(rpcCalls,0);
});

test('daily supplier save uses one mutation RPC, with no catalog or FIFO preflight; database denial is respected',async()=>{
 const calls=[];let error=null;
 const db={from:()=>{throw new Error('Unexpected catalog request');},rpc:async(name,args)=>{calls.push({name,args});return {data:{operation_id:id(20)},error};}};
 const route=load('src/app/api/admin/financial-operations/route.ts',{
  'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},
  '@/lib/financialOperations/server':{financialMutationContext:async()=>({db,actor:id(9)}),financialContext:async()=>{throw new Error('Unexpected permission preflight');}},
  '@/lib/financialOperations/validation':validation,'@/lib/financialOperations/formDefaults':formDefaults,
  '@/lib/financialOperations/voucherStatus':load('src/lib/financialOperations/voucherStatus.ts',{'./validation':validation}),
  '@/lib/financialOperations/specialized':{specialTypes:[]}
 },{Response});
 const payload={...base,operation_type:'supplier_payment',supplier_id:id(3),detail:{supplier_allocation_mode:'oldest_first'},confirm_without_voucher:true};
 const request=()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({action:'save',key:id(10),payload})});
 assert.equal((await route.POST(request())).status,200);assert.equal(calls.length,1);assert.equal(calls[0].name,'save_financial_operation');assert.equal(calls[0].args.p_actor,id(9));assert.equal(calls[0].args.p_key,id(10));
 error={code:'42501',message:'No tenés permisos'};assert.equal((await route.POST(request())).status,403);
});

test('minimal business forms accept blank optional detail with internal classifications and no sales method selection',()=>{
 for(const kind of ['supplier_payment','customer_collection','payroll_payment']){
  const input={...base,operation_type:kind,concept:'',category:'Injected category',financial_concept_id:id(8),payment_method_id:'',supplier_id:kind==='supplier_payment'?id(3):undefined,order_id:kind==='customer_collection'?id(4):undefined,employee_id:kind==='payroll_payment'?id(5):undefined,direction:kind==='customer_collection'?'ingreso':'egreso',detail:kind==='payroll_payment'?{period:'2026-10',payroll_kind:'salary'}:{},cost_center_id:id(6),route_sheet_id:id(7)};
  const prepared=formDefaults.prepareOperationForm(input,[{id:id(2),name:'Transferencia'}]);
  validation.validateOperation(prepared);
  assert.equal(prepared.category,{supplier_payment:'Proveedores',customer_collection:'Cobranza',payroll_payment:'Sueldos'}[kind]);
  assert.equal(prepared.concept,types.operationLabels[kind]);assert.equal(prepared.financial_concept_id,undefined);assert.equal(prepared.cost_center_id,undefined);assert.equal(prepared.route_sheet_id,undefined);assert.equal(prepared.payment_method_id,id(2));assert.equal(input.concept,'');
 }
});
test('operating expense still requires detail and removes personnel linkage',()=>{
 const input={...base,concept:'',person_id:id(3),detail:{beneficiary:'Employee'}};
 const prepared=formDefaults.prepareOperationForm(input,[]);
 assert.throws(()=>validation.validateOperation(prepared),/detalle/);assert.equal(prepared.person_id,undefined);assert.equal(prepared.detail.beneficiary,undefined);
 validation.validateOperation({...prepared,concept:'Servicio de electricidad'});
});
test('existing payment method survives edits and a missing internal method blocks before persistence',()=>{
 assert.equal(formDefaults.withInternalPaymentMethod(base,[]).payment_method_id,id(2));
 assert.throws(()=>formDefaults.withInternalPaymentMethod({...base,payment_method_id:''},[{id:id(3),name:'Tarjeta en cuotas'}]),/medio interno/);
});
test('receipt allocation identifies its receipt and purchase order without creating a second payable',()=>{
 const label=fields.purchaseLabel({id:id(3),invoice_number:'FC-1',purchase_reception_id:id(4),purchase_receptions:{delivery_slip_number:'R-10',purchase_orders:{oc_code:'OC-20'}}});
 assert.equal(label,'Recepción R-10 · OC-20 · FC-1');
 assert.equal(types.inferOperationType({category:'Cobranza',type:'ingreso'}),'customer_collection');
 assert.equal(types.inferOperationType({category:'Recaudación',type:'ingreso'}),'customer_collection');
});

test('direct receipt upload sends multipart with account and order links; preview sends no real upload',async()=>{
 let sent;
 const attachments=load('src/components/finanzas/operations/OperationAttachments.tsx',{'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-session'}}})}}},'@/lib/optimizeImageUpload':{optimizeImageUpload:async file=>file}},{FormData,fetch:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({success:true,id:id(60)})};},crypto:require('node:crypto').webcrypto});
 const file=new File(['fake-pdf'],'receipt.pdf',{type:'application/pdf'});
 const result=await attachments.uploadOperationAttachments([file],{...base,operation_type:'customer_collection',currency:'ARS',order_id:id(4)});
 assert.equal(result,id(60));assert.equal(sent.url,'/api/admin/treasury-vouchers');assert.equal(sent.options.headers['Content-Type'],undefined);assert.equal(sent.options.body.get('category'),'collection');assert.equal(sent.options.body.get('accountId'),id(1));assert.equal(sent.options.body.get('orderIds'),JSON.stringify([id(4)]));assert.equal(sent.options.body.getAll('files').length,1);
 sent=undefined;await attachments.uploadOperationAttachments([file],{...base,currency:'ARS'},true);assert.equal(sent,undefined);
});

const treasuryTime=load('src/lib/treasuryTransactionTime.ts');
const supplierFrequency=load('src/lib/financialOperations/supplierFrequency.ts',{'../treasuryTransactionTime':treasuryTime});
test('supplier suggestions rank payment frequency, resolve ties, cap at eight and preserve deliberate empty preferences',()=>{
 const suppliers=Array.from({length:12},(_,i)=>({id:id(i),name:`Proveedor ${i}`}));
 const payments=suppliers.slice(0,11).flatMap((s,i)=>Array.from({length:i===3?24:i===5?2:1},()=>({supplier_id:s.id,created_at:i===4?'2026-10-06T15:00:00Z':'2026-09-01T15:00:00Z'})));
 const enriched=supplierFrequency.withSupplierFrequency(suppliers,payments),suggested=supplierFrequency.frequentSuppliers(enriched);
 assert.equal(suggested.length,8);assert.deepEqual(Array.from(suggested.slice(0,3)),[id(3),id(5),id(4)]);assert.ok(!suggested.includes(id(11)));assert.equal(enriched[3].recent_payment_count,24);
 assert.equal(supplierFrequency.supplierPreferences(null,enriched).frequent.length,8);
 assert.equal(supplierFrequency.supplierPreferences({frequent:[],hidden:[id(3)]},enriched).frequent.length,0);
 assert.equal(supplierFrequency.supplierPreferences({frequent:'broken'},enriched).frequent.length,8);
});
test('supplier history uses three calendar months, clamps short months and follows Buenos Aires date',()=>{
 const october=supplierFrequency.supplierFrequencyWindow(new Date('2026-10-06T15:00:00Z'));assert.equal(october.start,'2026-07-06T00:00:00-03:00');assert.equal(october.end,'2026-10-06T23:59:59.999-03:00');
 assert.equal(supplierFrequency.supplierFrequencyWindow(new Date('2026-05-31T15:00:00Z')).start,'2026-02-28T00:00:00-03:00');
 assert.equal(supplierFrequency.supplierFrequencyWindow(new Date('2026-10-06T01:00:00Z')).start,'2026-07-05T00:00:00-03:00');
});
const supplierAllocation=load('src/lib/financialOperations/supplierAllocation.ts',{'../treasuryTransactionTime':treasuryTime});
test('account payment previews oldest debt first, partial balances, and excludes other suppliers/currencies/future/void documents',()=>{
 const row=(n,date,total=100,patch={})=>({id:id(n),supplier_id:id(3),currency:'ARS',purchase_date:date,created_at:date,total_amount:total,paid_amount:0,...patch});
 const rows=[row(5,'2026-09-01',80),row(4,'2026-08-01'),row(6,'2026-01-01',100,{currency:'USD'}),row(7,'2026-01-01',100,{status:'Anulado'}),row(8,'2026-01-01',100,{document_type:'Nota de Crédito'}),row(9,'2026-12-01'),row(10,'2026-01-01',100,{supplier_id:id(11)})];
 const before=JSON.stringify(rows);const allocations=supplierAllocation.oldestSupplierAllocations(rows,id(3),'ARS','130','2026-10-06');
 assert.deepEqual(JSON.parse(JSON.stringify(allocations)),[{purchase_id:id(4),amount:'100.00'},{purchase_id:id(5),amount:'30.00'}]);assert.equal(JSON.stringify(rows),before);
 const remaining=supplierAllocation.oldestSupplierAllocations(rows.map(r=>r.id===id(4)?{...r,paid_amount:100}:r.id===id(5)?{...r,paid_amount:30}:r),id(3),'ARS','90','2026-10-06');assert.equal(remaining.length,1);assert.equal(remaining[0].amount,'50.00');
});
test('account payment preview uses cents and restores the current edited allocation to document availability',()=>{
 const rows=[{id:id(4),supplier_id:id(3),currency:'ARS',total_amount:0.30,paid_amount:0.20,editable_allocation_amount:'0.10',purchase_date:'2026-08-01'}];
 assert.equal(supplierAllocation.oldestSupplierAllocations(rows,id(3),'ARS','0.20','2026-10-06')[0].amount,'0.20');
 assert.equal(supplierAllocation.oldestSupplierAllocations(rows,id(3),'USD','0.20','2026-10-06').length,0);
 const normalized=formDefaults.prepareOperationForm({...base,operation_type:'supplier_payment',supplier_id:id(3),allocations:[{purchase_id:id(4),amount:'10'}],detail:{supplier_allocation_mode:'oldest_first'}},[]);assert.equal(normalized.allocations.length,0);validation.validateOperation(normalized);
 assert.throws(()=>validation.validateOperation({...normalized,detail:{supplier_allocation_mode:'invalid'}}));
 assert.throws(()=>validation.validateOperation({...normalized,supplier_id:undefined,detail:{supplier_kind:'eventual',supplier_allocation_mode:'oldest_first'}}));
});
test('account payment date cutoff follows the accounting timezone',()=>{
 const allocations=supplierAllocation.oldestSupplierAllocations([{id:id(4),supplier_id:id(3),currency:'ARS',total_amount:10,paid_amount:0,purchase_date:'2026-10-07T01:00:00Z'}],id(3),'ARS','10','2026-10-06');assert.equal(allocations.length,1);
});

const voucherStatus=load('src/lib/financialOperations/voucherStatus.ts',{'./validation':validation});
test('supplier without a voucher requires an explicit decision; queued and attached receipts bypass the warning',()=>{
 const input={...base,operation_type:'supplier_payment',voucher_ids:[]};
 assert.equal(voucherStatus.needsSupplierVoucher(input),true);assert.equal(voucherStatus.needsSupplierVoucher(input,1),false);
 assert.throws(()=>voucherStatus.requireSupplierVoucherConfirmation(input),/Confirmá/);voucherStatus.requireSupplierVoucherConfirmation({...input,confirm_without_voucher:true});
 voucherStatus.requireSupplierVoucherConfirmation({...input,voucher_ids:[id(4)]});assert.throws(()=>voucherStatus.requireSupplierVoucherConfirmation({...input,confirm_without_voucher:'yes'}),/inválida/);
});
test('pending voucher status survives reload and clears after attachment; cancelled and reversal rows have no pending warning',()=>{
 const tx={financial_operations:{operation_type:'supplier_payment',status:'posted',operation_vouchers:[]}};
 assert.equal(voucherStatus.supplierVoucherPending(tx),true);
 assert.equal(voucherStatus.supplierVoucherPending({...tx,financial_operations:{...tx.financial_operations,operation_vouchers:[{voucher_id:id(4)}]}}),false);
 assert.equal(voucherStatus.supplierVoucherPending({...tx,financial_operations:{...tx.financial_operations,status:'cancelled'}}),false);
 assert.equal(Boolean(voucherStatus.supplierVoucherPending({...tx,reversal_of_transaction_id:id(5)})),false);
 assert.equal(Boolean(voucherStatus.supplierVoucherPending({})),false);
});

test('payable document options exclude paid, voided, credit notes and another currency, retaining editable allocations',()=>{
 const doc={id:id(4),supplier_id:id(3),currency:'ARS',total_amount:266291.44999999995,paid_amount:0,status:'Pendiente'};
 assert.equal(supplierAllocation.supplierDocumentPending(doc),266291.45);
 const docs=[doc,{...doc,id:id(5),paid_amount:266291.45},{...doc,id:id(6),document_type:'Nota de Crédito'},{...doc,id:id(7),currency:'USD'},{...doc,id:id(8),status:'Anulado'},{...doc,id:id(9),paid_amount:266291.45,editable_allocation_amount:'10.00'}];
 assert.deepEqual(Array.from(supplierAllocation.payableSupplierDocuments(docs,id(3),'ARS'),p=>p.id),[id(4),id(9)]);
});
