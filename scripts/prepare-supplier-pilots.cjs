// Offline bridge, never a posting instruction. Each source row remains independently reviewable.
const fs=require('fs'),crypto=require('crypto');
const preview=JSON.parse(fs.readFileSync('output/cc-planning/import-preview.json','utf8')),erp=JSON.parse(fs.readFileSync('output/cc-planning/erp-schema.json','utf8')),analysis=JSON.parse(fs.readFileSync('output/cc-planning/analysis.json','utf8'));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),cents=n=>Math.round(Number(n)*100),day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const normalized=s=>String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const names=process.argv.slice(2).length?process.argv.slice(2):['Cooper','Mundileno','Sirena','Garden Life'];
fs.mkdirSync('output/cc-planning/pilots',{recursive:true});const summaries=[];
for(const name of names){
 const supplier=erp.suppliers.find(s=>normalized(s.name)===normalized(name));
 const rows=preview.rows.filter(r=>normalized(r.supplierName)===normalized(name)).map(r=>{
  const candidates=[];
  if(r.supplierId&&r.effectiveDate&&r.ledgerEffect!==null){
   if(r.component==='payment')for(const p of erp.payments.filter(p=>p.supplier_id===r.supplierId&&!p.reversed_at)){
    if(cents(p.amount)===Math.abs(cents(r.ledgerEffect))&&day(p.cash_date||p.created_at)===r.effectiveDate)candidates.push({source:'payment',id:p.id,currency:p.currency,cashId:p.cash_transaction_id});
   }else if(['purchase','credit','debit'].includes(r.component))for(const p of erp.purchases.filter(p=>p.supplier_id===r.supplierId&&p.status!=='Anulado')){
    const sign=p.document_type==='Nota de Crédito'?-1:1;
    if(sign*cents(p.total_amount)===cents(r.ledgerEffect)&&day(p.purchase_date)===r.effectiveDate)candidates.push({source:'purchase',id:p.id,currency:p.currency,reference:p.invoice_number});
   }
  }
  return {sheetId:r.sheetId,sourceRow:r.sourceRow,component:r.component,contentHash:r.contentHash,sourceAccount:r.sourceAccount,businessLabel:r.businessLabel,documentCondition:r.documentCondition,date:r.effectiveDate,sourceCurrency:r.currency,ledgerEffect:r.ledgerEffect,originalValues:r.originalValues,financeCandidateRows:r.financeCandidates,erpCandidates:candidates,problems:r.problems,decision:'pending_evidence',selected:false};
 });
 const claims=new Map();for(const r of rows)for(const c of r.erpCandidates){const key=c.source+':'+c.id;claims.set(key,(claims.get(key)||0)+1);}
 const byComponent={};for(const r of rows){byComponent[r.component]=(byComponent[r.component]||0)+cents(r.ledgerEffect||0);r.sharedErpCandidates=r.erpCandidates.filter(c=>claims.get(c.source+':'+c.id)>1);r.requires=[...(!r.sourceCurrency?['confirm_currency']:[]),...(r.problems||[]),...(r.erpCandidates.length===0&&!['opening','adjustment'].includes(r.component)?['identify_original_event']:[]),...(r.erpCandidates.length>1||r.sharedErpCandidates.length?['resolve_ambiguity']:[])];}
 const sourceTotal=rows.reduce((n,r)=>n+cents(r.ledgerEffect||0),0)/100,summary=analysis.cc.summary.filter(r=>normalized(r.supplier)===normalized(name));
 const balance=erp.balances.find(r=>r.id===supplier?.id),summaryTotal=summary.reduce((n,r)=>n+cents(r.erpSignBalance),0)/100;
 const manifest={mode:'simulation',supplierName:name,supplierId:supplier?.id||null,cutoffDate:preview.cutoffDate,sourceBook:preview.sourceBook,sourceSnapshotHash:preview.sourceSnapshotHash,erpEvidenceHash:hash(erp),erpCapturedAt:erp.capturedAt,sourceRows:rows.length,sourceNet:sourceTotal,byComponent:Object.fromEntries(Object.entries(byComponent).map(([k,v])=>[k,v/100])),summary:summary.map(s=>({sourceRow:s.row,account:s.account,businessLabel:s.company,updated:s.updated,erpSignBalance:s.erpSignBalance})),summaryNet:summaryTotal,sourceVsSummary:Math.round((sourceTotal-summaryTotal)*100)/100,currentErpOpening:erp.starts.find(s=>s.supplier_id===supplier?.id)||null,currentErpBalance:balance||null,comparable:false,blockers:['Source currencies require evidence before posting.','Cutoff and scope must match before comparing ERP and sheet balances.','No row is financially approved by this simulation.'],counts:{exactUniqueCandidates:rows.filter(r=>r.erpCandidates.length===1&&!r.sharedErpCandidates.length).length,ambiguousOrShared:rows.filter(r=>r.erpCandidates.length>1||r.sharedErpCandidates.length).length,noErpCandidate:rows.filter(r=>!r.erpCandidates.length).length,selected:0},rows};
 manifest.manifestHash=hash(manifest);fs.writeFileSync('output/cc-planning/pilots/'+normalized(name)+'.json',JSON.stringify(manifest,null,2));summaries.push({supplier:name,rows:rows.length,...manifest.counts,sourceVsSummary:manifest.sourceVsSummary});
}
console.log(JSON.stringify({mode:'simulation',financialWrites:0,pilots:summaries}));
