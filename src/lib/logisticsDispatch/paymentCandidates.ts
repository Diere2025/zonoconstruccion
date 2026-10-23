import {explicitMovementLog} from './planningPayments';

type Row=Record<string,any>;
const words=(value:string):string[]=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z]+/g)||[];
/** Suggestions are evidence for a human review, never an automatic allocation. */
export function freightPaymentCandidates(transactions:Row[],plan:Row,occupied:Set<string>,reversed:Set<string>){
 const header=Array.isArray(plan.logistics_dispatches)?plan.logistics_dispatches[0]:plan.logistics_dispatches;
 const name=words(header.carrier_name||'');
 return transactions.flatMap<Row>(tx=>{
  if(occupied.has(tx.id)||reversed.has(tx.id)||tx.reversal_of_transaction_id||tx.type!=='egreso'||tx.currency!=='ARS'||Number(tx.amount)<=0||![tx.category,tx.sub_category].some(v=>String(v||'').trim().toLowerCase()==='servicio de flete'))return [];
  const logs:string[]=[...new Set<string>(String(tx.notes||'').toUpperCase().match(/LOG_REC_\d+[A-Z]?/g)||[])];
  if(logs.length&&!logs.includes(header.code))return [];
  const text=words([tx.concept,tx.notes].join(' ')),carrierMatch=name.length>=2&&name.every(w=>text.includes(w));
  const exact=explicitMovementLog(tx.notes)===header.code;
  return [{...tx,match:exact?'log':carrierMatch?'carrier':'review',evidence:exact?'Menciona este LOG; confirmar correspondencia':carrierMatch?'Coincide el nombre del fletero; confirmar servicio':'Sin referencia suficiente; revisar comprobante'}];
 }).sort((a,b)=>({log:0,carrier:1,review:2}[a.match as 'log'|'carrier'|'review']-({log:0,carrier:1,review:2}[b.match as 'log'|'carrier'|'review'])||b.created_at.localeCompare(a.created_at)));
}
