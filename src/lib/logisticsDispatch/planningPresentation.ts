import {carrierCommercialProfile} from '@/lib/carrierIdentity';
type Row=Record<string,any>;
/** One actionable entry per active service, including provisional and final review. */
export function pendingDispatchSettlements(plans:Row[],fees:Row[]=[]){
 const entries=new Map<string,Row>();
 for(const row of plans){
  if(!['in_progress','completed'].includes(row.status)||entries.has(row.dispatch_id))continue;
  const fee=fees.find(f=>f.dispatchId===row.dispatch_id),state=row.paymentState;
  if(row.serviceCostConfirmed===false){entries.set(row.dispatch_id,{row,fee,kind:'review',amount:null});continue;}
  if(row.extrasNeedReview){entries.set(row.dispatch_id,{row,fee,kind:'review',amount:row.extraChargesDelta??null});continue;}
  if(row.settlementNeedsReview||Number(state?.overpaidAmount)>0){entries.set(row.dispatch_id,{row,fee,kind:'review',amount:state?.overpaidAmount||null});continue;}
  if(state?.liquidated||state?.state==='paid'||!state&&fee?.status==='paid')continue;
  const kind=state?.state==='needs_review'?'review':'pending';
  entries.set(row.dispatch_id,{row,fee,kind,amount:state?.remainingAmount??state?.expectedAmount??fee?.total??row.planned?.agreedAmount??null});
 }
 return [...entries.values()];
}
export function lastSevenDays(today:string){const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-6);return {from:day.toISOString().slice(0,10),to:today};}
const owner=(t:Row)=>t.carrier_id?'carrier:'+t.carrier_id:'company:'+t.company_key;
const previousDay=(value:string)=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
export function tariffOwnerName(t:Row,carriers:Row[]){return carriers.find(c=>c.id===t.carrier_id)?.name||(t.company_key==='gyv'?'GyV':t.company_key==='gavaplast'?'Gavaplast':t.label||'Fletero por identificar');}
export function tariffDisplayName(t:Row,carriers:Row[]){return tariffOwnerName(t,carriers)+' ('+String(t.effective_from||'').split('-').reverse().join('/')+')';}
export function tariffTimeline(tariffs:Row[],today:string):Row[]{return tariffs.map(t=>{const newer=tariffs.filter(x=>x.id!==t.id&&x.active!==false&&owner(x)===owner(t)&&x.zone_variant===t.zone_variant&&x.effective_from>t.effective_from).sort((a,b)=>a.effective_from.localeCompare(b.effective_from))[0];const inferred=newer?previousDay(newer.effective_from):null;const end=t.effective_to&&inferred?(t.effective_to<inferred?t.effective_to:inferred):t.effective_to||inferred;const replaced=tariffs.some(x=>(x.supersedes_tariff_id===t.id||x.supersedesTariffId===t.id)&&x.active!==false&&x.effective_from<=today);return {...t,effectiveEnd:end,isSuperseded:replaced,isCurrent:!replaced&&t.active!==false&&t.effective_from<=today&&(!end||end>=today)};});}
export function currentCarrierTariffs(tariffs:Row[],carrier:Row,date:string,zone:string):Row[]{const company=carrierCommercialProfile(carrier.name)?.company_key;const relevant=tariffTimeline(tariffs,date).filter(t=>t.isCurrent&&(t.carrier_id===carrier.id||t.company_key&&t.company_key===company)&&(t.zone_variant===zone||zone==='lp_zarate'&&t.zone_variant==='la_plata'));return relevant.sort((a,b)=>Number(!!b.carrier_id)-Number(!!a.carrier_id)||b.effective_from.localeCompare(a.effective_from));}
export function dayPaymentSummary(rows:Row[]){
 const departed=rows.filter(r=>r.status!=='cancelled'),entries=pendingDispatchSettlements(departed);
 const paid=departed.filter(r=>r.serviceCostConfirmed!==false&&r.paymentState?.liquidated&&!r.settlementNeedsReview&&!Number(r.paymentState?.overpaidAmount)).length;
 const review=0,pending=entries.length;
 const planned=departed.filter(r=>r.status==='planned').length,running=departed.filter(r=>r.status==='in_progress').length,cancelled=rows.length-departed.length;
 const parts=[pending?`${pending} pendientes de liquidar`:'',running?`${running} en recorrido`:'',planned?`${planned} por salir`:'',paid?`${paid} liquidadas`:''].filter(Boolean);
 return {paid,pending,planned,running,cancelled,review,label:!departed.length?'No salió · sin pagos pendientes':parts.join(' · ')||'Todas liquidadas',tone:pending||review?'pending':planned||running?'planned':departed.length?'paid':'cancelled'};
}
