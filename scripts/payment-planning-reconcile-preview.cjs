// Read-only comparison of the planning model with a private source snapshot.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const snapshotFile = process.argv[2];
const from = process.argv[3] || '2026-09-30';
const to = process.argv[4] || '2026-10-31';
if (!snapshotFile) throw new Error('Indicá la captura.');
const snapshot = JSON.parse(fs.readFileSync(snapshotFile,'utf8'));
const actual = snapshot.ranges.find(range=>range.range.startsWith('Actual!')).values;
const scenarios = snapshot.ranges.find(range=>range.range.startsWith('Escenarios!')).values;
const exportsValue = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/paymentPlanning/model.ts','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText,{exports:exportsValue});
const { project } = exportsValue;
const blocks = [
  { id:'cash',kind:'cash',name:'Efectivo',date:1,title:3,effect:5,balance:6,scenarioIndex:1,scenario:'intermedio' },
  { id:'personal',kind:'personal',name:'Cuentas personales',date:9,title:11,effect:13,balance:14,scenarioIndex:3,scenario:'intermedio' },
  { id:'company',kind:'company',name:'Cuentas ZONO',date:17,title:19,effect:21,balance:22,scenarioIndex:2,scenario:'pesimista' }
];
const iso = value => typeof value==='number' ? new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000).toISOString().slice(0,10) : '';
const norm = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const currency = value => Number(value).toFixed(2);
const funds = blocks.map(block=>({id:block.id,name:block.name,currency:'ARS',kind:block.kind,scenario:block.scenario,active:true}));
const previous = new Date(Date.parse(`${from}T12:00:00Z`)-86400000).toISOString().slice(0,10);
const balances = [], items = [], reservations = [], rates = [], controls = new Map(), exclusions = [];
for (const block of blocks) {
  let last;
  for (let index=2; index<actual.length; index++) {
    const row=actual[index]||[];
    if (iso(row[block.date])===previous && typeof row[block.balance]==='number') last=row[block.balance];
  }
  if (typeof last!=='number') throw new Error(`Falta saldo del ${previous} en ${block.id}.`);
  balances.push({id:`opening-${block.id}`,fund_id:block.id,effective_date:from,amount:currency(last),reserved_amount:'0.00',notes:'Saldo de cierre anterior de la hoja'});
  const scenarioValue = label => {
    const row=scenarios.find(row=>norm(row[0])===label);
    if (!row || typeof row[block.scenarioIndex]!=='number') throw new Error(`Falta escenario ${label} de ${block.id}.`);
    return currency(row[block.scenarioIndex]);
  };
  rates.push({id:`scenario-${block.id}`,fund_id:block.id,title:block.id==='cash'?'Rendiciones y Ventas Depo Zono':'Ingresos estimados',valid_from:from,valid_until:to,weekdays:[1,2,3,4,5,6],optimistic:scenarioValue('optimista'),intermediate:scenarioValue('intermedio'),pessimistic:scenarioValue('pesimista'),active:true});
}
for (let index=2; index<actual.length; index++) for (const block of blocks) {
  const row=actual[index]||[];
  const date=iso(row[block.date]);
  if (date<from || date>to) continue;
  const title=String(row[block.title]||'').trim();
  const label=norm(title);
  const effect=row[block.effect];
  if (typeof row[block.balance]==='number') controls.set(`${block.id}:${date}`,currency(row[block.balance]));
  if (!title) { if (typeof effect==='number'&&effect!==0) exclusions.push({row:index+1,fund:block.id,reason:'Importe sin detalle'}); continue; }
  if (/saldo inicial/.test(label)) { if (typeof effect==='number'&&effect!==0) exclusions.push({row:index+1,fund:block.id,reason:'Apertura informada dentro del período'}); continue; }
  if (/ingresos estimados|rendiciones y ventas depo/.test(label)) {
    const rate=rates.find(rate=>rate.fund_id===block.id);
    const weekday=((new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7)+1;
    const expected=weekday===7?0:Number(rate[block.scenario==='pesimista'?'pessimistic':'intermediate']);
    if (typeof effect!=='number' || Math.abs(effect-expected)>0.01) exclusions.push({row:index+1,fund:block.id,reason:`Escenario distinto de regla: ${effect} vs ${expected}`});
    continue;
  }
  if (typeof effect!=='number' || effect===0) { if (typeof effect!=='number' && !/ventas mayorista/.test(label)) exclusions.push({row:index+1,fund:block.id,reason:'Sin importe calculado'}); continue; }
  const base={id:`${block.id}-${index+1}`,fund_id:block.id,amount:currency(Math.abs(effect)),effective_date:date,notes:'',reversed_at:null};
  if (/reserva de sueldos/.test(label) && effect<0) reservations.push({...base,kind:'reserve',target_item_id:null});
  else if (/reingreso sueldos/.test(label) && effect>0) reservations.push({...base,kind:'release',target_item_id:null});
  else items.push({id:base.id,fund_id:block.id,kind:effect>0?'income':'expense',title,amount:base.amount,closed_amount:'0.00',scheduled_date:date,due_date:date,status:'active',priority:'normal',notes:'',source:'import',version:1});
}
const projection = project({funds,balances,items,realizations:[],reservations,transfers:[],rates,from,to,today:previous});
const differences = projection.map(row=>({fund:row.fund_id,date:row.date,source:controls.get(`${row.fund_id}:${row.date}`),projected:currency(row.free),difference:row.free-Number(controls.get(`${row.fund_id}:${row.date}`))})).filter(row=>row.source===undefined || Math.abs(row.difference)>0.011);
const report={capturedAt:snapshot.capturedAt,from,to,opening:balances,scenarioRules:rates,items:items.length,reservations:reservations.length,exclusions,differences,daysCompared:projection.length};
const file=path.join(path.dirname(snapshotFile),`preview-${from}-${to}.json`);
fs.writeFileSync(file,JSON.stringify(report,null,2));
console.log(JSON.stringify({from,to,items:items.length,reservations:reservations.length,daysCompared:projection.length,differences:differences.length,exclusions:exclusions.length,opening:balances.map(row=>({fund:row.fund_id,amount:row.amount})),file}));
