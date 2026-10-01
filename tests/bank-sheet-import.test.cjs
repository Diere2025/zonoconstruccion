const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,dependencies={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>dependencies[name],Intl,Date,Map,Set});return exports;}
const model=load('src/lib/paymentPlanning/model.ts');
const bank=load('src/lib/bankSheetImport.ts',{'./paymentPlanning/model':model});
const accounts=[{id:'mp3',name:'Cuenta MP3',currency:'ARS',type:'banco',is_active:true},{id:'cash',name:'Caja Efectivo Pesos',currency:'ARS',type:'efectivo',is_active:true}];
const header='Subcategoria,Fecha,Concepto,Categoria,Unidad,Tipo,Monto,Cuenta';
test('imports only banks in the selected period; excludes cash and opening balances',()=>{
  const csv=[header,'Publicidad,30/09/2026,Publicidad,Publicidad,ZONO,Egreso,"675.000,00",Cuenta.MP3','Otro,30/09/2026,Efectivo,Otro,ZONO,Egreso,500,Caja.EfectivoPesos','Saldo Inicial,30/09/2026,Saldo Inicial,Capital,ZONO,Ingreso,500,Cuenta.MP3','Otro,31/09/2026,Fecha mala,Otro,ZONO,Egreso,500,Cuenta.MP3','Otro,01/10/2026,Futuro,Otro,ZONO,Egreso,500,Cuenta.MP3'].join('\n');
  const result=bank.parseBankSheet(csv,accounts,'2026-09-01','2026-09-30');
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].amount,675000);assert.equal(result.rows[0].date,'2026-09-30');assert.equal(result.excludedCash,1);assert.equal(result.issues.length,2);
});
test('preserves import identities when unrelated source rows are inserted or reordered',()=>{
  const a='Otro,30/09/2026,Publicidad,Publicidad,ZONO,Egreso,675000,Cuenta.MP3',b='Otro,29/09/2026,Proveedor,Proveedores,ZONO,Egreso,100,Cuenta.MP3';
  const one=bank.parseBankSheet([header,a,b].join('\n'),accounts,'2026-09-01','2026-09-30').rows;
  const two=bank.parseBankSheet([header,b,a].join('\n'),accounts,'2026-09-01','2026-09-30').rows;
  assert.equal(one[0].key,two[1].key);
});
test('existing manual or imported amounts and same-day repeated source rows require review',()=>{
  const base={key:'first',accountId:'mp3',date:'2026-09-30',type:'egreso',amount:675000};
  const rows=[base,{...base,key:'second'},{...base,key:'imported',amount:20}];
  const existing=[{bank_import_key:null,financial_account_id:'mp3',created_at:'2026-10-01T01:00:00Z',type:'egreso',amount:'675000'},{bank_import_key:'imported',financial_account_id:'mp3',created_at:'2026-09-30T15:00:00Z',type:'egreso',amount:'20'}];
  assert.equal(bank.classifyBankRows(rows,existing).map(row=>row.status).join(','),'review,review,imported');
  assert.equal(bank.classifyBankRows(rows,[]).map(row=>row.status).join(','),'new,review,new');
});
test('quoted commas and multiline concepts are preserved',()=>{
  const csv=[header,'Otro,30/09/2026,"Proveedor, detalle\nsegunda línea",Otro,ZONO,Egreso,"1.234,56",Cuenta.MP3'].join('\n');
  const row=bank.parseBankSheet(csv,accounts,'2026-09-01','2026-09-30').rows[0];
  assert.equal(row.amount,1234.56);assert.equal(row.concept,'Proveedor, detalle\nsegunda línea');
});
test('the source uses Gasto for outgoing bank movements',()=>{
  const csv=[header,'Otro,30/09/2026,Publicidad,Publicidad,ZONO,Gasto,"675.000,00",Cuenta.MP3'].join('\n');
  const result=bank.parseBankSheet(csv,accounts,'2026-09-01','2026-09-30');
  assert.equal(result.issues.length,0);assert.equal(result.rows[0].type,'egreso');
});
test('recognizes an existing manual payment without consuming it twice for repeated rows',()=>{
  const row={key:'first',accountId:'mp3',date:'2026-09-30',type:'egreso',amount:675000,concept:'Publicidad'};
  const existing=[{financial_account_id:'mp3',created_at:'2026-09-30T15:00:00Z',type:'egreso',amount:'675000',concept:' PUBLICIDAD '}];
  assert.equal(bank.classifyBankRows([row,{...row,key:'second'}],existing).map(row=>row.status).join(','),'imported,review');
});
