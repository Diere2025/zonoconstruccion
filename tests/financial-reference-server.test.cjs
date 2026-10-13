const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name]});return exports;}
const references=load('src/lib/financialOperations/references.ts');
const {movementApplications,voucherMovementReferences,supplierReferenceData}=load('src/lib/financialOperations/referenceServer.ts',{'./references':references,'./readBatches':load('src/lib/financialOperations/readBatches.ts')});
function database(tables){return {from(name){let rows=tables[name]||[];return {select(){return this;},or(){return this;},order(){return this;},eq(key,value){rows=rows.filter(r=>r[key]===value);return this;},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return this;},async range(start,end){return {data:rows.slice(start,end+1),error:null};}};}};}
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
test('statement order references appear on existing movements without duplicating client references',async()=>{
 const source=order=>({bank_statement_order_links:{order_id:order.id,orders:order}});
 const db=database({bank_entry_ledger_links:[{entry_id:'e1',cash_transaction_id:'t1',bank_statement_entries:source({id:'o1',legacy_code:'PED-ANTERIOR'})},{entry_id:'e2',cash_transaction_id:'t2',bank_statement_entries:[source({id:'o2',legacy_code:'PED-2'})]},{entry_id:'e3',cash_transaction_id:'t3',bank_statement_entries:{bank_statement_order_links:{order_id:null,orders:null}}}],client_payments:[{id:'client',cash_transaction_id:'t2',orders:{id:'o2',legacy_code:'PED-2'}}]});
 const result=await movementApplications(db,[{id:'t1',type:'ingreso'},{id:'t2',type:'ingreso'},{id:'t3',type:'ingreso'}]);assert.equal(result.get('t1')[0].code,'PED-ANTERIOR');assert.equal(result.get('t2').length,1);assert.equal(result.has('t3'),false);
});

test('verified captured orders remain visible before the statement link exists; unverified and conflicting payments do not',async()=>{
 const payment={is_verified:true,is_hidden:false,is_internal:false,order_id:'o',order_code:'JS1',orders:{id:'o',legacy_code:'JS1'}};
 const tx=['valid','unverified','conflict','internal'].map(id=>({id,type:'ingreso'}));
 const links=tx.map(t=>({entry_id:'e-'+t.id,cash_transaction_id:t.id,bank_statement_entries:null}));
 const captures=tx.map(t=>({id:t.id,prepared_entry_id:'e-'+t.id,statement_entry_id:null,mp_payments:{...payment,...(t.id==='unverified'?{is_verified:false}:t.id==='conflict'?{order_code:'JS2'}:t.id==='internal'?{is_internal:true}:{})}}));
 const result=await movementApplications(database({bank_entry_ledger_links:links,mp_bank_web_rows:captures}),tx);
 assert.equal(result.get('valid')[0].code,'JS1');for(const id of ['unverified','conflict','internal'])assert.equal(result.has(id),false);
});

test('dispatch and rendition references point to existing records without creating collections',async()=>{
 const db=database({logistics_dispatch_movements:[{transaction_id:'cash',logistics_dispatches:{id:'dispatch',code:'LOG_REC_05344'},treasury_settlements:{id:'rend',code:'REND07052'}}]});
 const result=await movementApplications(db,[{id:'cash',type:'egreso'}]);
 assert.equal(result.get('cash').length,2);assert.equal(result.get('cash')[0].kind,'Delivery');assert.match(result.get('cash')[0].href,/delivery=LOG_REC_05344/);assert.equal(result.get('cash')[1].code,'REND07052');
});


test('parallel movement batches retain every reference beyond two batch boundaries',async()=>{
 const tx=Array.from({length:201},(_,i)=>({id:'t'+i,type:'ingreso'}));
 const db=database({client_payments:tx.map(t=>({id:'p'+t.id,cash_transaction_id:t.id,amount:1,orders:{id:'o'+t.id,legacy_code:'PED-'+t.id}}))});
 const result=await movementApplications(db,tx);
 assert.equal(result.size,201);
 for(const t of tx){assert.equal(result.get(t.id).length,1);assert.equal(result.get(t.id)[0].id,'o'+t.id);}
});
