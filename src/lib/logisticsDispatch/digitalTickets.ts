import {splitOrderCodes} from '@/lib/orderSync';
type Row=Record<string,any>;
const one=(value:any)=>Array.isArray(value)?value[0]:value;
const sameCodes=(left:string,right:string)=>splitOrderCodes(left).some(code=>splitOrderCodes(right).includes(code));
const cents=(value:unknown)=>Math.round(Number(value)*100);
function argentinaDate(value:string){if(!Number.isFinite(new Date(value).getTime()))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
/** Read-only evidence: never changes the persisted ticket or creates a payment. */
export function resolveDispatchDigitalTickets(settlements:Row[],payments:Row[],attempts:Row[],date:string):Row[]{
 const allTickets=settlements.flatMap(link=>one(link.treasury_settlements)?.treasury_settlement_electronic_tickets||[]);
 const active=[...attempts.filter(a=>a.executed&&a.order_id),...allTickets.filter(t=>t.order_id).map(t=>({order_id:t.order_id,order_code:t.order_code}))];
 const visible=payments.filter(p=>p.is_verified&&!p.is_hidden&&!p.is_internal);
 const eligible=visible.filter(p=>active.some(a=>a.order_id===p.order_id&&(!a.order_code||!p.order_code||sameCodes(p.order_code,a.order_code))));
 const claimed=new Set(allTickets.flatMap(t=>t.mp_payment_id?[t.mp_payment_id]:[]));
 const candidates=(ticket:Row)=>eligible.filter(p=>!claimed.has(p.id)&&argentinaDate(p.received_at)===date&&cents(p.amount)>0&&cents(p.amount)===cents(ticket.amount)&&(!ticket.order_id||ticket.order_id===p.order_id)&&(!ticket.order_code||sameCodes(p.order_code,ticket.order_code)));
 return settlements.map(link=>{const settlement=one(link.treasury_settlements);if(!settlement)return link;
  const tickets=(settlement.treasury_settlement_electronic_tickets||[]).map((ticket:Row)=>{
   if(ticket.mp_payment_id){const payment=visible.find(p=>p.id===ticket.mp_payment_id&&(!ticket.order_id||!p.order_id||ticket.order_id===p.order_id)&&(!ticket.order_code||!p.order_code||sameCodes(p.order_code,ticket.order_code)));return {...ticket,digital_match:payment?{state:'linked_verified',payment}:{state:'linked_unverified'}};}
   const matches=candidates(ticket);
   const unique=matches.length===1&&!allTickets.some(other=>other!==ticket&&!other.mp_payment_id&&candidates(other).some(p=>p.id===matches[0].id));
   return {...ticket,digital_match:unique?{state:'unique_verified_match',payment:matches[0]}:{state:matches.length?'ambiguous':'unmatched'}};
  });
  return {...link,treasury_settlements:{...settlement,treasury_settlement_electronic_tickets:tickets}};
 });
}