const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const mod={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/financialOperations/references.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod});
const {movementCode,supplierApplications}=mod;
test('credit applications show reciprocal document references without creating a payment reference',()=>{
 const docs=[{id:'nc',invoice_number:'NC-1',document_type:'Nota de Crédito'},{id:'bill',invoice_number:'F-1',document_type:'Factura'}];
 const refs=mod.supplierCreditReferences([{credit_id:'nc',purchase_id:'bill',amount:'30.00'}],docs);
 assert.equal(refs.get('bill')[0].kind,'Nota de crédito');assert.equal(refs.get('bill')[0].amount,30);
 assert.equal(refs.get('nc')[0].kind,'Documento compensado');assert.match(refs.get('nc')[0].href,/purchase=bill/);
 assert.equal(mod.supplierCreditReferences([{credit_id:'nc',purchase_id:'bill',amount:30}],[...docs.slice(0,1),{...docs[1],status:'Anulado'}]).size,0);
});
test('one payment applied partially to two documents has the same code in both directions',()=>{
 const payments=[{id:'p1',cash_transaction_id:'t1'},{id:'p2',cash_transaction_id:'t2'},{id:'p3',cash_transaction_id:'t3',reversed_at:'2026-10-08'}];
 const purchases=[{id:'d1',invoice_number:'A-0001-123',document_type:'Factura'},{id:'d2',invoice_number:'REC-12',document_type:'Remito'}];
 const movements=[{id:'t1',type:'egreso',movement_code:'PAG-0000000001'},{id:'t2',type:'egreso',movement_code:'PAG-0000000002'}];
 const refs=supplierApplications([{payment_id:'p1',purchase_id:'d1',amount:'30.12'},{payment_id:'p1',purchase_id:'d2',amount:'20.50'},{payment_id:'p2',purchase_id:'d1',amount:40},{payment_id:'p3',purchase_id:'d1',amount:99}],payments,purchases,movements);
 assert.equal(refs.byPayment.get('p1').length,2);
 assert.equal(refs.byPurchase.get('d1').length,2);
 assert.equal(refs.byPurchase.get('d1')[0].code,'PAG-0000000001');
 assert.equal(refs.byPurchase.get('d2')[0].code,'PAG-0000000001');
 assert.equal(refs.byPurchase.get('d1')[0].amount,refs.byPayment.get('p1')[0].amount);
 assert.equal(refs.byPayment.get('p1')[1].kind,'Recepción');
 assert.match(refs.byPayment.get('p1')[0].href,/purchase=d1/);
 assert.match(refs.byPurchase.get('d1')[0].href,/transaction=t1/);
 assert.equal(refs.byPayment.has('p3'),false);
});
test('legacy identifiers stay unique without truncating UUIDs or dropping unposted payments',()=>{
 const a='abcdefgh-0000-0000-0000-000000000001',b='abcdefgh-0000-0000-0000-000000000002';
 assert.notEqual(movementCode({id:a,type:'egreso'}),movementCode({id:b,type:'egreso'}));
 assert.equal(movementCode({id:a,type:'ingreso',movement_code:'COB-0000000003'}),'COB-0000000003');
 const refs=supplierApplications([{payment_id:a,purchase_id:'doc',amount:'0.22'}],[{id:a,cash_transaction_id:null}],[{id:'doc',invoice_number:'F-1'}],[]);
 assert.equal(refs.byPurchase.get('doc')[0].href,'');
 assert.equal(refs.byPurchase.get('doc')[0].amount,0.22);
});

test('collection badges combine direct and imported order references without duplicate or cancelled links',()=>{
 const row={client_payments:[{order_id:'o1',orders:{legacy_code:'JS1'}},{order_id:'cancelled',reversed_at:'2026-10-01'}],applications:[{id:'o1',kind:'Pedido',code:'JS1',href:'order1'},{id:'o2',kind:'Pedido',code:'JS2',href:'order2'},{id:'v',kind:'Comprobante',code:'REC',href:'voucher'}]};
 assert.equal(mod.movementOrderReferences(row).map(r=>r.code).join(','),'JS1,JS2');
 assert.equal(mod.movementOrderReferences({applications:row.applications.slice(1,2)}).length,1);
 assert.equal(mod.movementOrderReferences({}).length,0);
});
