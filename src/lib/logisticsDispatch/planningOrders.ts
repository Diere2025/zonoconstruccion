import {sheetDate} from './model';
type Row=Record<string,any>;
/** Count distinct orders per physical load, never add both loads' counts together. */
export function deriveLoadOrders(plans:Row[], records:{code:string;date:string;runNumber:number;orderCode:string;zone:string}[]){
 return plans.map(p=>{const h=Array.isArray(p.logistics_dispatches)?p.logistics_dispatches[0]:p.logistics_dispatches;
  const loads=p.planned.loads.map((l:Row)=>{const orders=records.filter(r=>r.code===h?.code&&r.date===p.planned.deliveryDate&&(r.runNumber===l.runNumber||r.runNumber===0&&p.planned.loads.length===1)&&!/^ENC/i.test(r.orderCode));
   if(!orders.length)return {...l,ordersDerived:false};
   return {...l,zone:[...new Set(orders.map(r=>r.zone.trim()).filter(Boolean))].join(' · '),plannedOrders:new Set(orders.map(r=>r.orderCode)).size,ordersDerived:true};});
  return {...p,planned:{...p.planned,loads}};
 });
}
export function deliveredOrderRecords(values:any[][]){return values.flatMap(v=>{const date=sheetDate(v[1]),code=String(v[92]||'').trim().toUpperCase(),orderCode=String(v[0]||'').trim().toUpperCase(),run=String(v[13]||'').trim().match(/^(?:R\s*)?(\d+)$/i);return date&&code&&orderCode&&(run||!String(v[13]||'').trim())?[{code,date,runNumber:run?Number(run[1]):0,orderCode,zone:String(v[78]||'')}]:[];});}
