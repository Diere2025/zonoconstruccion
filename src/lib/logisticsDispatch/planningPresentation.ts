import {carrierCommercialProfile} from '@/lib/carrierIdentity';
type Row=Record<string,any>;
/** One actionable entry per closed LOG, including payments still only present in Caja. */
export function pendingDispatchSettlements(plans:Row[],fees:Row[]=[]){
 const entries=new Map<string,Row>();
 for(const row of plans){
  if(row.status!=='completed'||entries.has(row.dispatch_id))continue;
  const fee=fees.find(f=>f.dispatchId===row.dispatch_id),state=row.paymentState;
  if(row.paymentSourcePending?.length){entries.set(row.dispatch_id,{row,fee,kind:'cash',amount:row.paymentSourcePending.reduce((n:number,p:Row)=>n+(Number(p.amount)||0),0)});continue;}
  if(row.extrasNeedReview){entries.set(row.dispatch_id,{row,fee,kind:'review',amount:row.extraChargesDelta??null});continue;}
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
export function dayPaymentSummary(rows:Row[]){const departed=rows.filter(r=>r.status!=='cancelled');const paid=departed.filter(r=>r.paymentState?.liquidated).length;const review=departed.filter(r=>r.status==='completed'&&r.paymentSourcePending?.length).length;const pending=departed.filter(r=>r.status==='completed'&&!r.paymentState?.liquidated&&!r.paymentSourcePending?.length).length;const planned=departed.filter(r=>r.status!=='completed').length;const cancelled=rows.length-departed.length;return {paid,pending,planned,cancelled,review,label:!departed.length?'No salió · sin pagos pendientes':review?`${review} pagos en Caja por vincular${pending?' · '+pending+' pendientes de liquidar':''}${paid?' · '+paid+' liquidadas':''}`:pending?`${pending} pendientes de liquidar${paid?' · '+paid+' liquidadas':''}`:planned?`${planned} por salir${paid?' · '+paid+' liquidadas':''}`:'Todas liquidadas'+(cancelled?' · '+cancelled+' no salió':''),tone:pending||review?'pending':planned?'planned':departed.length?'paid':'cancelled'};}
