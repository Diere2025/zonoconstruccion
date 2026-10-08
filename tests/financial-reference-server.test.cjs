const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name]});return exports;}
const references=load('src/lib/financialOperations/references.ts');
const {movementApplications,voucherMovementReferences,supplierReferenceData}=load('src/lib/financialOperations/referenceServer.ts',{'./references':references});
function database(tables){return {from(name){let rows=tables[name]||[];return {select(){return this;},order(){return this;},eq(key,value){rows=rows.filter(r=>r[key]===value);return this;},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return this;},async range(start,end){return {data:rows.slice(start,end+1),error:null};}};}};}
test('movement reads normalize object/array relations and vouchers list all associated operations',async()=>{
 const tx=[{id:'t1',type:'egreso',movement_code:'PAG-1',operation_id:'o1'},{id:'t2',type:'ingreso',movement_code:'COB-2',operation_id:'o2'}];
 const db=database({
  cash_transactions:tx,
  supplier_payments:[{id:'p',cash_transaction_id:'t1',purchase_id:'d',supplier_id:'s',amount:'12.34'}],
  supplier_purchases:[{id:'d',supplier_id:'s',invoice_number:'F-1',document_type:'Factura'}],
  supplier_payment_allocations:[{id:'a',payment_id:'p',purchase_id:'d',amount:'12.34',supplier_purchases:[{id:'d',invoice_number:'F-1',document_type:'Factura'}]}],
  client_payments:[{id:'c',cash_transaction_id:'t2',amount:10,orders:{id:'order',legacy_code:'PED-1'}}],
  operation_vouchers:[{operation_id:'o1',voucher_id:'v',treasury_vouchers:[{id:'v',reference:'REC-1'}]},{operation_id:'o2',voucher_id:'v',treasury_vouchers:{id:'v',reference:'REC-1'}}]
 });
 const forward=await movementApplications(db,tx),reverse=await voucherMovementReferences(db,['v']);
 assert.equal(forward.get('t1')[0].code,'F-1');assert.equal(forward.get('t1')[0].amount,12.34);
 assert.equal(forward.get('t2')[0].code,'PED-1');assert.match(forward.get('t2')[0].href,/order=order/);
 assert.equal(reverse.get('v').length,2);assert.equal(reverse.get('v')[0].code,'PAG-1');assert.equal(reverse.get('v')[1].code,'COB-2');
 const supplier=await supplierReferenceData(db,'s');assert.equal(supplier.byPurchase.get('d')[0].code,'PAG-1');
});
test('allocation pagination retains every document past the database page boundary',async()=>{
 const allocations=Array.from({length:501},(_,i)=>({id:`a${i}`,payment_id:'p',purchase_id:`d${i}`,amount:1,supplier_purchases:{id:`d${i}`,invoice_number:`F-${i}`}}));
 const result=await movementApplications(database({supplier_payments:[{id:'p',cash_transaction_id:'t'}],supplier_payment_allocations:allocations}),[{id:'t',type:'egreso'}]);
 assert.equal(result.get('t').length,501);assert.equal(result.get('t').at(-1).code,'F-500');
});