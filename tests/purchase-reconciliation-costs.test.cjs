const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const model={};vm.runInNewContext(compile('src/lib/costs/model.ts'),{exports:model,Date,Intl,Map});
const mod={};vm.runInNewContext(compile('src/lib/costs/databasePurchases.ts'),{exports:mod,require:()=>model,Map});
const engine={};vm.runInNewContext(compile('src/lib/costs/engine.ts'),{exports:engine,require:()=>model,Map,Set,Date});
const receipt={id:'receipt',reception_date:'2026-09-29',delivery_slip_number:'R-1',suppliers:{name:'Proveedor'}};
const item={id:'item',product_id:'P',product_name:'Producto',quantity_received:10,unit_cost:100,purchase_receptions:receipt};
const reconciled={id:'invoice-line',receipt_item_id:'item',quantity:4,net_amount:440,bill:{number:'FC-1',bill_date:'2026-10-17',currency:'ARS',updated_at:'2026-10-17T15:00:00Z'},item:{...item,receipt}};
const def={articles:[{code:'P',name:'Producto',aliases:['Producto'],unit:'unidad',factor:1,fallback:null}],products:[],recipes:[],captured:'2026-09-01'};
const product={code:'P',id:'P',name:'Producto',purchaseName:'Producto',origin:'Compra',family:'Otros',price:200,termination:'',brandLabel:''};
function db(lines){return{from(table){let limit='9999-12-31';return{select(){return this;},eq(){return this;},lte(_,value){limit=value;return this;},order(){return this;},async range(){return{data:table==='supplier_bill_lines'?lines.filter(l=>l.bill.bill_date<=limit):table==='purchase_reception_items'?[item]:[],error:null};}};}};}
(async()=>{
  const sheet=[{key:'SHEET',source:'Recibidos ZONO',row:1,receipt:'R-1',name:'Producto',code:'P',date:'2026-09-29',vendor:'Proveedor',quantity:10,unit:'unidad',cost:100}];
  const result=await mod.databasePurchases(db([reconciled]),def,[{id:'P',name:'Producto'}],sheet,'2026-10-17',[]);
  assert.equal(sheet.length,0,'Explicit remito replaces Sheet evidence');
  const current=result.filter(p=>!p.validUntil);assert.equal(current.reduce((sum,p)=>sum+p.quantity,0),10,'Partial billing never double counts receipt quantity');
  assert.equal(current.find(p=>p.source==='Comprobantes conciliados').cost,110,'Cost uses invoice net without VAT/perceptions');
  assert.equal(current.find(p=>p.source==='Recepciones del sistema').quantity,6);
  assert.equal(engine.calculate(def,result,product,'2026-10-17',[]).material,110);
  assert.equal(engine.calculate(def,result,product,'2026-09-30',[]).material,100,'Later invoice cannot leak into prior cost history');
  const historical=result.filter(p=>p.date<='2026-09-30'&&(!p.validUntil||p.validUntil>'2026-09-30'));assert.equal(historical.reduce((sum,p)=>sum+p.quantity,0),10);
  const before=await mod.databasePurchases(db([reconciled]),def,[{id:'P',name:'Producto'}],[],'2026-09-30',[]);assert.equal(before[0].quantity,10);
  const reversed=await mod.databasePurchases(db([]),def,[{id:'P',name:'Producto'}],[],'2026-10-17',[]);assert.equal(reversed.length,1);assert.equal(reversed[0].quantity,10);assert.equal(reversed[0].cost,100);
  console.log('Reconciled costs: net price, partial quantities, Sheet deduplication, historical cutoffs and reversal: OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
