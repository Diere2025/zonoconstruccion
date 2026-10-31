// Offline preview only. Never posts balances, cash, stock or spreadsheet changes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const source = JSON.parse(fs.readFileSync('output/cc-planning/sheets-snapshot.json','utf8'));
const erp = JSON.parse(fs.readFileSync('output/cc-planning/erp-schema.json','utf8'));
const norm = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const suppliers = new Map();
for (const supplier of erp.suppliers) {
  const key = norm(supplier.name);
  suppliers.set(key,[...(suppliers.get(key)||[]),supplier]);
}
const summary = new Map(source.summary.values.slice(1).filter(r=>r[0]).map(r=>[norm(r[0]),r]));
const serialDay = serial => {
  if(typeof serial!=='number'||!Number.isInteger(serial))return null;
  const day = new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10);
  return /^2026-/.test(day) ? day : null;
};
const financeIndex = new Map();
for(const row of source.finance.candidates) {
  const v=row.values;
  if(v[5]!=='Gasto')continue;
  const key=[norm(v[2]),serialDay(v[1]),Math.round(Number(v[6])*100)].join('|');
  financeIndex.set(key,[...(financeIndex.get(key)||[]),row.row]);
}
const types = new Map([
  ['Saldo Deudor','opening'],['Saldo Acreedor','opening'],['Pago realizado','payment'],
  ['Mercadería recibida','purchase'],['Nota de crédito','credit'],['Nota de Debito','debit'],
  ['Diferencia a favor','adjustment'],['Diferencia en contra','adjustment']
]);
const sheetId=String(source.sources[0].sheets.find(s=>s.properties.title==='Proveedores').properties.sheetId);
const rows=source.cc.values.slice(1).map((v,i)=>{
  const account=summary.get(norm(v[2]));
  const name=v[9]||account?.[1]||'';
  const candidates=suppliers.get(norm(name))||[];
  const date=serialDay(v[1]);
  const numeric=typeof v[6]==='number'&&Number.isFinite(v[6]);
  const effect=numeric&&['Débito','Crédito'].includes(v[5])?Math.round(v[6]*100)*(v[5]==='Débito'?1:-1):null;
  const problems=[];
  if(!date)problems.push('Fecha ausente o fuera del período de captura');
  if(effect===null)problems.push('Importe o signo no reconocido');
  if(candidates.length!==1)problems.push('Proveedor sin equivalencia inequívoca');
  if(!v[2]||norm(v[2])==='cuenta')problems.push('Etiqueta de cuenta inválida');
  if(!types.has(v[3]))problems.push('Operación no reconocida');
  const financeCandidates=v[3]==='Pago realizado'?financeIndex.get([norm(name),date,Math.round(Number(v[6])*100)].join('|'))||[]:[];
  return {sheetId,sourceRow:i+2,component:types.get(v[3])||'unknown',contentHash:hash(v),
    originalValues:v,sourceAccount:v[2],supplierName:name,supplierId:candidates.length===1?candidates[0].id:null,
    documentCondition:account?.[3]==='Cuenta 1'?'facturado':account?.[3]==='Cuenta 2'?'por_remito':'historico',
    businessLabel:v[10]||account?.[2]||null,effectiveDate:date,
    currency:null,currencyReason:'La fuente no declara moneda: requiere validar pesos antes de aplicar',
    ledgerEffect:effect===null?null:(effect/100).toFixed(2),financeCandidates,
    problems,status:problems.length?'invalid':'pending_evidence',selected:false};
});
const uses = new Map();
for(const row of rows)for(const candidate of row.financeCandidates)uses.set(candidate,(uses.get(candidate)||0)+1);
for(const row of rows)if(row.financeCandidates.some(id=>uses.get(id)>1))row.problems.push('Candidato financiero compartido con otra fila: revisar identidad');
const previous=fs.existsSync('output/cc-planning/import-preview.json')?JSON.parse(fs.readFileSync('output/cc-planning/import-preview.json','utf8')):null;
const preview={mode:'preview',sourceBook:source.sources[0].spreadsheetId,cutoffDate:source.capturedOn,createdAt:previous?.sourceSnapshotHash===hash(source)?previous.createdAt:new Date().toISOString(),sourceSnapshotHash:hash(source),erpSnapshotHash:hash(erp),
  caveat:'Ninguna fila aprobada. La identidad financiera necesita volver al registro original y cotejarse con ERP.',
  counts:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),rows};
fs.writeFileSync('output/cc-planning/import-preview.json',JSON.stringify(preview,null,2));
console.log(JSON.stringify({mode:preview.mode,rows:rows.length,counts:preview.counts,selected:rows.filter(r=>r.selected).length,output:'output/cc-planning/import-preview.json'}));
