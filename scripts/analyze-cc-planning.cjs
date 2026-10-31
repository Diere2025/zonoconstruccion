const fs=require('fs'),crypto=require('crypto');
const d=JSON.parse(fs.readFileSync('output/cc-planning/sheets-snapshot.json','utf8'));
const e=JSON.parse(fs.readFileSync('output/cc-planning/erp-schema.json','utf8'));
const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const cents=v=>Math.round(Number(v||0)*100);
const date=v=>typeof v==='number'?new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10):String(v||'');
const countBy=(rows,f)=>rows.reduce((a,r)=>(a[f(r)]=(a[f(r)]||0)+1,a),{});
const cc=d.cc.values.slice(1).map((v,i)=>({row:i+2,date:date(v[1]),account:v[2],operation:v[3],number:v[4],type:v[5],amount:v[6],supplier:v[9],company:v[10],notes:v[8]}));
const sums=d.summary.values.slice(1).filter(r=>r[0]).map((r,i)=>({row:i+2,account:r[0],supplier:r[1],company:r[2],subaccount:r[3],sheetBalance:cents(r[6])/100,erpSignBalance:-cents(r[6])/100,updated:date(r[8])}));
const recalc=sums.map(s=>({...s,recomputed:cc.filter(r=>norm(r.account)===norm(s.account)).reduce((n,r)=>n+(r.type==='Crédito'?1:-1)*Number(r.amount||0),0)}));
const pay=d.finance.candidates;
const ccPays=cc.filter(r=>r.operation==='Pago realizado');
const key=(name,day,amount)=>[norm(name),day,cents(amount)].join('|');
const index=new Map();for(const r of pay){const v=r.values;if(v[5]!=='Gasto')continue;const k=key(v[2],date(v[1]),v[6]);index.set(k,[...(index.get(k)||[]),r.row]);}
const paymentMatches=ccPays.map(r=>({ccRow:r.row,supplier:r.supplier,date:r.date,amount:r.amount,candidates:index.get(key(r.supplier,r.date,r.amount))||[]}));
const raw=d.purchaseLines.filter(x=>x.values[0]||x.values[4]||x.values[5]);
const raw26=raw.filter(x=>date(x.values[0]).startsWith('2026-'));
const byDoc=new Map();for(const r of raw26){const v=r.values,k=[norm(v[4]),date(v[0]),v[1],v[2]].join('|');let g=byDoc.get(k);if(!g){g={supplier:v[4],date:date(v[0]),number:v[1],type:v[2],rows:[],total:0};byDoc.set(k,g);}g.rows.push(r.row);g.total+=Number(v[13])||0;}
const linked=new Set(e.payments.filter(p=>!p.reversed_at).map(p=>p.cash_transaction_id));
const activePayments=e.payments.filter(p=>!p.reversed_at);
const activeMovements=e.movements.filter(t=>t.type==='egreso'&&!t.reversal_of_transaction_id&&t.operation_status!=='cancelled');
const allocations=new Map();for(const a of e.allocations)allocations.set(a.payment_id,(allocations.get(a.payment_id)||0)+cents(a.amount));
const stats={
 asOf:'30/10/2026',
 cc:{rows:cc.length,operations:countBy(cc,r=>r.operation),rawAccounts:new Set(cc.map(r=>r.account)).size,summaryAccounts:sums.length,summarySupplierNames:new Set(sums.map(r=>norm(r.supplier))).size,companies:countBy(sums,r=>r.company),missingReceipts:cc.filter(r=>r.operation==='Mercadería recibida'&&!r.number).length,negativeAmounts:cc.filter(r=>r.amount<0).length,missingDates:cc.filter(r=>!r.date),missingAccount:cc.filter(r=>!r.account),badAccount:cc.filter(r=>r.account==='Cuenta'),aliasesOutsideSummary:[...new Set(cc.filter(r=>r.account&&!sums.some(s=>norm(s.account)===norm(r.account))).map(r=>r.account))],recalculationDifferences:recalc.filter(r=>Math.abs(r.recomputed-r.sheetBalance)>=.01),totalByCompany:sums.reduce((a,r)=>(a[r.company]=(a[r.company]||0)+cents(r.erpSignBalance),a),{}),summary:sums},
 finance:{readRows:d.finance.readRows,candidates:pay.length,directions:countBy(pay,r=>r.values[5]),categories:countBy(pay,r=>r.values[3]),ccPaymentComparison:{exactUnique:paymentMatches.filter(x=>x.candidates.length===1).length,ambiguous:paymentMatches.filter(x=>x.candidates.length>1).length,unmatched:paymentMatches.filter(x=>!x.candidates.length).length},comparisonCaveat:'Exact supplier text after case/accent/space normalization + date + amount; candidates only, no approved linkage.'},
 purchases:{sourceRows:raw.length,rows2026:raw26.length,groups2026:byDoc.size,invalidDateExamples:raw.filter(x=>!date(x.values[0]).match(/^(202[4-6])-/)).slice(0,8)},
 erp:{counts:e.counts,starts:e.starts.map(s=>({supplier:s.name,startDate:s.start_date,openingArs:s.opening_ars,openingUsd:s.opening_usd})),activePayments:activePayments.length,reversedPayments:e.payments.length-activePayments.length,activeSupplierCategoryOutflows:activeMovements.length,categoryOutflowsWithPayment:activeMovements.filter(t=>linked.has(t.id)).length,categoryOutflowsWithoutPayment:activeMovements.filter(t=>!linked.has(t.id)).length,purchasesByStatus:countBy(e.purchases,r=>r.status),noDueDate:e.purchases.filter(p=>!p.due_date).length,unallocatedPayments:activePayments.filter(p=>cents(p.amount)>(allocations.get(p.id)||0)).length,cooper:e.balances.find(s=>norm(s.name)==='cooper')},
 hashes:{sheets:crypto.createHash('sha256').update(fs.readFileSync('output/cc-planning/sheets-snapshot.json')).digest('hex'),erp:crypto.createHash('sha256').update(fs.readFileSync('output/cc-planning/erp-schema.json')).digest('hex')}
};
fs.writeFileSync('output/cc-planning/analysis.json',JSON.stringify(stats,null,2));
fs.writeFileSync('output/cc-planning/payment-candidates.json',JSON.stringify(paymentMatches,null,2));
console.log(JSON.stringify({...stats,cc:{...stats.cc,summary:undefined},purchases:{...stats.purchases,invalidDateExamples:stats.purchases.invalidDateExamples.map(x=>({row:x.row,date:x.values[0]}))}},null,2));
