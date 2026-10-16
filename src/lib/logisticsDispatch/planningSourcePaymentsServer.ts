import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {nextDate} from '@/lib/paymentPlanning/model';
import {SOURCE_IDS,sheetDate,sheetAmount,normalized,normalizeAccount,movementFingerprint} from './model';
import {planningRows} from './planningServer';
import {planningPaymentStates} from './planningPaymentsServer';
type Row=Record<string,any>;
/** Preview corrected source LOGs against an existing payment's date, account, concept and amount. No writes. */
export async function planningSourcePaymentPreview(db:any,plans:Row[]){
 const byCode=new Map<string,string>();for(const p of plans){if(p.status==='cancelled')continue;const h=Array.isArray(p.logistics_dispatches)?p.logistics_dispatches[0]:p.logistics_dispatches;byCode.set(h.code,p.dispatch_id);}
 const values=await fetchSpreadsheetValues(SOURCE_IDS.cash,"'Caja'!A2:Q12000");
 const source=values.flatMap((v,row)=>{const code=String(v[0]||'').trim().toUpperCase(),date=sheetDate(v[1]),amount=sheetAmount(v[4]);return /^LOG_REC_\d+[A-Z]?$/.test(code)&&date&&amount!==null&&amount>0&&normalized(v[3])==='gasto'&&normalized(v[6])==='servicio de flete'?[{code,date,amount,type:'egreso',concept:v[2]||'',account:v[14]||'',row:row+2,category:'Servicio de Flete'}]:[];});
 // Canonical references already identify a payment, regardless of its payment day
 // or whether Caja uses the carrier's name and the ERP a generic concept.
 const identified=await planningPaymentStates(db,plans);
 const settled=new Set(identified.filter((p:Row)=>{const h=Array.isArray(p.logistics_dispatches)?p.logistics_dispatches[0]:p.logistics_dispatches;const total=source.filter(s=>s.code===h.code).reduce((n,s)=>n+Math.round(s.amount*100),0);return total>0&&Math.round((p.paymentState.paidAmount||0)*100)===total&&p.paymentState.state!=='needs_review';}).map((p:Row)=>(Array.isArray(p.logistics_dispatches)?p.logistics_dispatches[0]:p.logistics_dispatches).code));
 const relevant=source.filter(s=>byCode.has(s.code)&&!settled.has(s.code));if(!relevant.length)return {rows:[],issues:[]};
 const dates=relevant.map(s=>s.date).sort();
 const ledger=await planningRows(db.from('cash_transactions').select('id,type,amount,currency,financial_account_id,concept,category,sub_category,notes,created_at,movement_code,reversal_of_transaction_id,financial_accounts(name)').eq('type','egreso').gte('created_at',dates[0]+'T00:00:00-03:00').lt('created_at',nextDate(dates[dates.length-1])+'T00:00:00-03:00').order('id'));
 const date=(stamp:string)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
 const accountKey=(value:string)=>normalizeAccount(value).replace(/^efectivospesos$/,'efectivopesos');
 const key=(row:any)=>movementFingerprint({...row,account:accountKey(row.account)});
 const ledgerGroups=new Map<string,Row[]>(),sourceGroups=new Map<string,typeof source>();
 for(const row of ledger){if(row.currency!=='ARS'||row.reversal_of_transaction_id)continue;const a=Array.isArray(row.financial_accounts)?row.financial_accounts[0]:row.financial_accounts;const fingerprint=key({...row,date:date(row.created_at),account:a?.name||''});ledgerGroups.set(fingerprint,[...(ledgerGroups.get(fingerprint)||[]),row]);}
 for(const row of source){const fingerprint=key(row);sourceGroups.set(fingerprint,[...(sourceGroups.get(fingerprint)||[]),row]);}
 const allocatedIds=new Set<string>();
 for(let i=0;i<ledger.length;i+=150){const result=await db.from('logistics_freight_payment_allocations').select('transaction_id').in('transaction_id',ledger.slice(i,i+150).map(t=>t.id));if(result.error&&!['42P01','PGRST205'].includes(result.error.code))throw result.error;(result.data||[]).forEach((a:Row)=>allocatedIds.add(a.transaction_id));}
 const rows:Row[]=[],issues:Row[]=[];
 for(const s of relevant){const fingerprint=key(s),matches=ledgerGroups.get(fingerprint)||[];if(matches.length!==1||sourceGroups.get(fingerprint)?.length!==1){issues.push({code:s.code,row:s.row,amount:s.amount,paymentDate:s.date,message:matches.length?'Coincidencia ambigua: revisar manualmente.':'Pago registrado en Caja; no se identificó su movimiento en el ERP. Revisar importación o referencia del pago.'});continue;}if(allocatedIds.has(matches[0].id))continue;rows.push({dispatchId:byCode.get(s.code),transactionId:matches[0].id,transaction:matches[0],source:{...s,spreadsheetId:SOURCE_IDS.cash},needsClassification:normalized(matches[0].category)!=='servicio de flete'&&normalized(matches[0].sub_category)!=='servicio de flete'});}
 const reversed=new Set<string>();for(let i=0;i<rows.length;i+=150){const r=await planningRows(db.from('cash_transactions').select('id,reversal_of_transaction_id').in('reversal_of_transaction_id',rows.slice(i,i+150).map(x=>x.transactionId)).order('id'));r.forEach(x=>reversed.add(x.reversal_of_transaction_id));}
 return {rows:rows.filter(r=>!reversed.has(r.transactionId)),issues};
}
