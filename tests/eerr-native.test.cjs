const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const exportsModel={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/eerrNative/model.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsModel,Intl,Date,Set,Map,Number,Object,Array,Error});
const {buildReport,validateProvisions,provisionFieldErrors,period,dailyProgress}=exportsModel;
const sale=(patch={})=>({id:'o',code:'PED1',day:'2026-10-01',sales:1000,freightCharged:100,surchargesCharged:50,cost:400,knownCost:400,exchange:false,status:'Estimación',...patch});
const movement=(patch={})=>({id:'m',day:'2026-10-01',code:'PAG1',concept:'Gasto',category:'Gastos Operativos',type:'egreso',amount:100,personal:0,currency:'ARS',businessUnit:'ZONO',reversed:false,...patch});
const run=(sales=[],moves=[],p={},today='2026-10-31')=>buildReport('2026-10',sales,moves,p,today);

test('explicit MP interest is financial income; reversed interest and investment capital never count as yield',()=>{
 const interest=movement({category:'Inversiones',concept:'MP - Intereses Ganados',type:'ingreso',amount:10.01});
 const r=run([sale()],[interest,{...interest,reversed:true}]);assert.equal(r.totals.otherIncome,10.01);assert.equal(r.totals.revenue,1150);assert.equal(r.totals.expenses,0);assert.equal(r.totals.result,760.01);assert.equal(r.days[0].result,760.01);assert.equal(r.days[0].otherIncome,10.01);assert.equal(r.issues.length,0);
 const ambiguous=run([],[{...interest,concept:'Rescate de inversión'}]);assert.equal(ambiguous.totals.otherIncome,0);assert.equal(ambiguous.totals.result,null);assert.equal(ambiguous.issues.length,1);
});
test('MercadoPago interest stays income after reclassification and annulled pairs stay excluded',()=>{
 const credit=movement({category:'Intereses ganados',concept:'MP - Intereses Ganados',type:'ingreso',amount:8.39});
 const legacy={...credit,category:'Inversiones',businessUnit:'Mov. Financiero'};
 const original={...credit,id:'original',amount:2.83,reversed:true};
 const reversal={...original,id:'reversal',type:'egreso',concept:'Anulación: MP - Intereses Ganados'};
 const report=run([],[credit,legacy,original,reversal]);
 assert.equal(report.totals.otherIncome,16.78);
 assert.equal(report.totals.expenses,0);
 assert.equal(report.totals.result,16.78);
 assert.ok(report.entries.every(entry=>entry.category==='Intereses ganados'));
 assert.equal(report.excludedMovements.length,2);
 assert.ok(report.excludedMovements.every(entry=>entry.category==='Intereses ganados'));
});
test('partial balance includes identified income while unresolved expenses keep full result pending',()=>{const r=run([sale()],[movement({category:'Sin clasificar'})]);assert.equal(r.totals.result,null);assert.equal(r.totals.identifiedBalance,750);assert.equal(r.issues.length,1);});
test('provision errors identify the category and the missing field before saving',()=>{
 const errors=provisionFieldErrors({amount:NaN,status:'estimated',note:''});assert.match(errors.amount,/importe/);assert.match(errors.note,/fundamento/);assert.equal(errors.status,undefined);
 assert.throws(()=>validateProvisions({Sueldos:{amount:20,status:'estimated',note:''}}),/Sueldos: Completá el fundamento/);
 assert.equal(Object.keys(provisionFieldErrors({amount:0,status:'confirmed',note:'No corresponde'})).length,0);
});

test('advertising agency fee is separated while absent fee does not block the accepted cash basis',()=>{
 const advertising=movement({category:'Publicidad',concept:'Compra directa de publicidad',amount:1000});
 const incomplete=run([],[advertising]);assert.equal(incomplete.totals.result,-1000);assert.equal(incomplete.issues.length,0);
 const mapped=run([],[advertising,movement({category:'Publicidad',concept:'Publicidad - Fee Merco (Agencia Publicitaria)',amount:100})]);assert.equal(mapped.groups.find(g=>g.category==='Publicidad').amount,1000);assert.equal(mapped.groups.find(g=>g.category==='Publicidad (Fee)').amount,100);assert.equal(mapped.totals.expenses,1100);
 const explicitZero=run([],[advertising],{'Publicidad (Fee)':{amount:0,status:'confirmed',note:'Sin fee este mes'}});assert.equal(explicitZero.issues.length,0);
});

test('Hipergas supplier payments map to GLP and provision replaces them without duplication',()=>{
 const moves=[1460619.54,1000000,2049243.61].map(amount=>movement({concept:'Hipergas',category:'Proveedores',amount}));
 const r=run([],moves);assert.equal(r.groups.find(g=>g.category==='Insumo GLP').amount,4509863.15);assert.equal(r.totals.expenses,4509863.15);
 const replaced=run([],moves,{'Insumo GLP':{amount:5000000,status:'estimated',note:'Consumo mensual Hipergas'}});assert.equal(replaced.totals.expenses,5000000);assert.equal(replaced.groups.find(g=>g.category==='Insumo GLP').replaced,4509863.15);
});
test('Hipergas explicit debt and transfers retain their exclusion',()=>{const r=run([],[movement({concept:'Hipergas',category:'Proveedores (Deuda)'}),movement({concept:'Hipergas',category:'Movimiento de cuentas'})]);assert.equal(r.totals.expenses,0);assert.equal(r.excludedMovements.length,2);});
test('revenue includes freight and surcharges once; collections and supplier payments are excluded',()=>{const r=run([sale()],[movement(),movement({category:'Recaudación',type:'ingreso',amount:1150}),movement({category:'Proveedores',amount:400})]);assert.equal(r.totals.revenue,1150);assert.equal(r.totals.result,650);assert.equal(r.excludedMovements.length,2);});
test('returns and personal assignments reduce business expense without double counting',()=>{const r=run([sale()],[movement({amount:100,personal:30}),movement({type:'ingreso',amount:20})]);assert.equal(r.totals.expenses,50);assert.equal(r.totals.result,700);});
test('reversals and custody funds never become expenses',()=>{const r=run([sale()],[movement({reversed:true}),movement({category:'Fondos a rendir'}),movement({category:'Extracciones'}),movement({category:'Movimiento de cuentas'})]);assert.equal(r.totals.expenses,0);});
test('provisions replace whole category, including explicit zero',()=>{const r=run([sale()],[movement({category:'Sueldos',amount:500})],{Sueldos:{amount:0,status:'confirmed',note:'No corresponde'}});assert.equal(r.totals.expenses,0);assert.equal(r.groups.find(g=>g.category==='Sueldos').replaced,500);});
test('monthly cents distribute exactly and daily totals reconcile',()=>{const r=run([sale()],[],{Sueldos:{amount:100.01,status:'estimated',note:'Mes'}});assert.equal(r.totals.expenses,100.01);assert.equal(Math.round(r.days.reduce((a,d)=>a+d.expenses,0)*100),10001);assert.equal(Math.round(r.days.reduce((a,d)=>a+d.result,0)*100),Math.round(r.totals.result*100));});
test('selected cutoff allocates provisions using all Monday-to-Saturday days of the month',()=>{
 const r=buildReport('2026-10',[sale(),sale({day:'2026-10-11'})],[movement(),movement({day:'2026-10-11'})],{Sueldos:{amount:2700,status:'estimated',note:'Mes completo'}},'2026-10-24','2026-10-10');
 assert.equal(r.days.find(d=>d.day==='2026-10-04').expenses,0);
 assert.equal(r.days.find(d=>d.day==='2026-10-10').expenses,100);
 assert.equal(r.totals.expenses,1000);
 assert.equal(r.totals.result,-250);
 assert.equal(r.period.cutoff,'2026-10-10');assert.equal(r.period.length,31);assert.equal(r.days.length,10);assert.equal(r.totals.revenue,1150);assert.equal(r.totals.cmv,400);assert.ok(r.entries.every(e=>e.day<='2026-10-10'));
});
test('November rent skips Sundays and adds up to the same monthly amount at close',()=>{
 const provisions={Alquileres:{amount:2229951,status:'estimated',note:'Alquiler mensual'}};
 const payment=movement({day:'2026-11-10',category:'Alquileres',amount:2229951});
 const partial=buildReport('2026-11',[],[payment],provisions,'2026-11-10');
 assert.equal(partial.days[0].expenses,0);
 assert.equal(partial.days[7].expenses,0);
 assert.equal(partial.days[9].expenses,89198.04);
 assert.equal(partial.totals.expenses,713584.32);
 assert.equal(partial.excludedMovements.length,1);
 const closed=buildReport('2026-11',[],[payment],provisions,'2026-11-30');
 assert.equal(closed.entries.length,25);
 assert.equal(closed.totals.expenses,2229951);
});
test('cutoff rejects dates outside the month, nonexistent days and future dates',()=>{for(const [month,until] of [['2026-10','2026-09-30'],['2026-10','2026-10-25'],['2026-10','2026-11-01'],['2024-02','2024-02-30'],['2026-10','10/10/2026'],['2026-10','']])assert.throws(()=>period(month,'2026-10-24',until));assert.equal(period('2024-02','2026-10-24','2024-02-29').days.length,29);});
test('daily chart balances reconcile exactly with the report including interest and negative days',()=>{
 const r=run([sale()],[movement({day:'2026-10-02',amount:1000}),movement({category:'Inversiones',concept:'MP - Intereses Ganados',type:'ingreso',amount:10.01})],{Sueldos:{amount:100.01,status:'estimated',note:'Mes'}});
 const points=dailyProgress(r.days);assert.equal(points.at(-1).cumulativeResult,r.totals.identifiedBalance);assert.equal(points.length,r.days.length);assert.ok(points.some(p=>p.identifiedResult<0));assert.equal(points[0].totalCosts,403.71);
});
test('missing cost remains unknown and blocks a final result',()=>{const r=run([sale({cost:null,knownCost:40})]);assert.equal(r.totals.result,null);assert.equal(r.days[0].result,null);assert.equal(r.missingCosts,1);assert.equal(r.totals.cmv,40);});
test('unclassified or foreign currency movement is visible and blocks result',()=>{for(const patch of [{category:'Sin clasificar'},{currency:'USD'},{businessUnit:''}]){const r=run([sale()],[movement(patch)]);assert.equal(r.totals.result,null);assert.equal(r.issues.length,1);}});
test('exchange replacement cost is included while the review stays pending',()=>{
 const r=run([sale({exchange:true})]);
 assert.equal(r.totals.revenue,0);assert.equal(r.totals.cmv,400);
 assert.equal(r.totals.identifiedBalance,-400);assert.equal(r.totals.result,null);
 assert.match(r.issues[0].reason,/incluido en el CMV/);
});
test('a completed supplier review does not book the recovery or hide missing cost',()=>{
 const review=new Map([['o',{status:'supplier_recognized',supplier:'Proveedor',recognized_amount:400,note:'Reposición',version:1}]]);
 const runReview=s=>buildReport('2026-10',[sale({exchange:true,...s})],[],{},'2026-10-31',undefined,review);
 const complete=runReview({});
 assert.equal(complete.totals.result,-400);assert.equal(complete.issues.length,0);assert.equal(complete.exchanges[0].review.recognized_amount,400);
 const incomplete=runReview({cost:null,knownCost:125});
 assert.equal(incomplete.totals.cmv,125);assert.equal(incomplete.totals.result,null);assert.equal(incomplete.missingCosts,1);
});
test('provision validation rejects silent null, unknown category, negative and unsupported precision',()=>{for(const p of [null,[],{Otro:{amount:1,status:'estimated',note:'a'}},{Sueldos:{amount:null,status:'estimated',note:'a'}},{Sueldos:{amount:-1,status:'estimated',note:'a'}},{Sueldos:{amount:1.234,status:'estimated',note:'a'}},{Sueldos:{amount:1,status:'estimated',note:''}}])assert.throws(()=>validateProvisions(p));assert.equal(validateProvisions({Sueldos:{amount:0,status:'confirmed',note:'Cero explícito'}}).Sueldos.amount,0);});
test('period is calendar based even in leap years, rejects future and malformed month',()=>{assert.equal(period('2024-02','2026-10-24').length,29);for(const m of ['2026-13','2026-1','2026-11','2019-01'])assert.throws(()=>period(m,'2026-10-24'));});
test('Meta advertising replaces wallet funding and precargas without duplicating the fee',()=>{
 const expenses=[
  movement({category:'Publicidad',concept:'Binance - Carga de saldo',amount:900}),
  movement({category:'Publicidad',concept:'Publicidad - Fee',amount:40}),
 ];
 const provisions={Publicidad:{amount:1000,status:'estimated',note:'Anterior'}};
 const ads={account:'S731.04',issue:null,days:[{day:'2026-10-01',usd:10,spendArs:150,feeArs:8.25}]};
 const r=buildReport('2026-10',[],expenses,provisions,'2026-10-31',undefined,new Map(),ads);
 assert.equal(r.totals.expenses,158.25);
 assert.equal(r.groups.find(g=>g.category==='Publicidad').replaced,0);
 assert.equal(r.excludedMovements.find(m=>m.amount===900).reason,'Compra de USDT · fondos de Binance');
 assert.equal(r.groups.find(g=>g.category==='Publicidad (Fee)').replaced,40);
 assert.equal(r.excludedMovements.length,2);
 const incomplete=buildReport('2026-10',[],expenses,provisions,'2026-10-31',undefined,new Map(),{...ads,days:[],issue:'Meta no disponible'});
 assert.equal(incomplete.totals.expenses,0);
 assert.equal(incomplete.totals.result,null);
});
