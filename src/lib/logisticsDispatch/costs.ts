type Row=Record<string,any>;
export type DeliveryOutcome='delivered'|'postponed'|'cancelled'|'failed'|'pending'|'no_departure'|'errand'|'exchange';
const one=(x:any)=>Array.isArray(x)?x[0]:x;
const text=(x:unknown)=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function deliveryCostOutcome(row:Row):DeliveryOutcome{
 if(!row.executed)return 'no_departure';
 if(/^ENC\d+$/i.test(String(row.order_code||'')))return 'errand';
 if(/^CAMB\d+$/i.test(String(row.order_code||'')))return 'exchange';
 const state=text(row.outcome);
 if(/^(no entregado|fallido|failed)/.test(state))return 'failed';
 if(/^(entregado|delivered)/.test(state))return 'delivered';
 if(/^(postergado|postponed)/.test(state))return 'postponed';
 if(/^(anulado|cancelado|cancelled)/.test(state))return 'cancelled';
 return 'pending';
}
const allocate=(total:number,rows:Row[]):Map<string,number>=>{const result=new Map<string,number>();if(!rows.length)return result;const sorted=[...rows].sort((a,b)=>a.order_code.localeCompare(b.order_code));const base=Math.floor(total/sorted.length),remainder=total%sorted.length;sorted.forEach((row,i)=>result.set(row.order_code,base+(i<remainder?1:0)));return result;};
/** Service cost belongs to the service date; cash and debt recoveries are separate. */
export function calculateRealDispatchCosts(attempts:Row[],links:Row[],reversedIds:Set<string>=new Set(),terms?:Row|null){
 const transactions=new Map<string,Row>();for(const link of links){const tx=one(link.cash_transactions);if(tx?.id)transactions.set(tx.id,link.allocated_amount!==undefined&&link.allocated_amount!==null?{...tx,original_amount:tx.amount,amount:Number(link.allocated_amount)}:{...tx,...(link.purpose==='freight_refund'?{refund_payment_id:link.refund_payment_id}:{})});}
 const freightRoles=new Set(links.filter(l=>l.purpose==='freight_fee').map(l=>l.transaction_id||one(l.cash_transactions)?.id));
 const freight=[...transactions.values()].filter(t=>t.type==='egreso'&&(freightRoles.has(t.id)||[text(t.category),text(t.sub_category)].includes('servicio de flete')));
 const active=freight.filter(t=>!t.reversal_of_transaction_id&&!reversedIds.has(t.id)&&Number(t.amount)>0);
 const unsupported=active.filter(t=>t.currency!=='ARS'||!Number.isSafeInteger(Math.round(Number(t.amount)*100)));
 const ars=active.filter(t=>t.currency==='ARS'&&Number.isSafeInteger(Math.round(Number(t.amount)*100)));
 const refundRoles=new Set(links.filter(l=>l.purpose==='freight_refund').map(l=>l.transaction_id));
 const refunds=[...transactions.values()].filter(t=>t.type==='ingreso'&&t.currency==='ARS'&&refundRoles.has(t.id)&&!t.reversal_of_transaction_id&&!reversedIds.has(t.id)&&!reversedIds.has(t.refund_payment_id)&&Number(t.amount)>0);
 const refundedCents=refunds.reduce((n,t)=>n+Math.round(Number(t.amount)*100),0);
 const paidCents=-refundedCents+ars.reduce((sum,t)=>sum+Math.round(Number(t.amount)*100),0);
 const commercialDiscount=(terms?.deductions||[]).filter((d:Row)=>d.kind==='discount').reduce((n:number,d:Row)=>n+Math.round(Number(d.amount)*100),0);
 const offsetCents=(terms?.deductions||[]).filter((d:Row)=>d.kind==='offset').reduce((n:number,d:Row)=>n+Math.round(Number(d.amount)*100),0);
 const grossCents=terms?Math.round(Number(terms.gross_amount)*100):null;
 const confirmed=grossCents!==null&&Number.isSafeInteger(grossCents)&&grossCents>0&&commercialDiscount>=0&&offsetCents>=0&&commercialDiscount+offsetCents<=grossCents;
 const serviceCents=confirmed?grossCents!-commercialDiscount:paidCents;
 const status=unsupported.length||terms&&(!confirmed||terms.cost_pending)?'needs_review':confirmed||ars.length?'located':'missing';
 const grouped=new Map<string,Row>();const conflicts:string[]=[];
 for(const row of attempts){const code=String(row.order_code||'').trim().toUpperCase();if(!code)continue;const outcome=deliveryCostOutcome({...row,order_code:code});const previous=grouped.get(code);if(previous&&(previous.outcome!==outcome||previous.order_id&&row.order_id&&previous.order_id!==row.order_id)){conflicts.push(code);continue;}grouped.set(code,{order_code:code,order_id:row.order_id||null,outcome});}
 const orders=[...grouped.values()];const delivered=orders.filter(r=>r.outcome==='delivered');const nonDelivered=orders.filter(r=>['postponed','cancelled','failed'].includes(r.outcome));const included=[...delivered,...nonDelivered];
 const allocationReady=status==='located'&&confirmed&&!conflicts.length;
 const onlyDelivered=allocationReady?allocate(serviceCents,delivered):new Map<string,number>();
 const allClosed=allocationReady?allocate(serviceCents,included):new Map<string,number>();
 const nonDeliveredCents=nonDelivered.reduce((sum,r)=>sum+(allClosed.get(r.order_code)||0),0);
 return {status,currency:'ARS',costBasis:confirmed?'confirmed_service':'cash_unconfirmed',costConfirmed:confirmed,serviceCostAmount:allocationReady?serviceCents/100:null,grossServiceAmount:confirmed?grossCents!/100:null,commercialDiscountAmount:commercialDiscount/100,offsetAmount:offsetCents/100,netPayableAmount:confirmed?(serviceCents-offsetCents)/100:null,paidAmount:ars.length?paidCents/100:null,paymentCount:ars.length,payments:[...ars.map(t=>({id:t.id,code:t.movement_code||t.id,amount:Number(t.amount),date:t.created_at})),...refunds.map(t=>({id:t.id,code:t.movement_code||t.id,amount:-Number(t.amount),date:t.created_at,originalPaymentId:t.refund_payment_id}))],reversedPaymentCount:freight.filter(t=>t.reversal_of_transaction_id||reversedIds.has(t.id)).length,unsupportedCurrencyCount:unsupported.length,
  deliveredCount:delivered.length,postponedCount:orders.filter(r=>r.outcome==='postponed').length,cancelledCount:orders.filter(r=>r.outcome==='cancelled').length,failedCount:orders.filter(r=>r.outcome==='failed').length,pendingOutcomeCount:orders.filter(r=>r.outcome==='pending').length,excludedCount:orders.filter(r=>['no_departure','errand','exchange'].includes(r.outcome)).length,conflictingOrders:[...new Set(conflicts)],
  allocatedAmount:allocationReady&&delivered.length?serviceCents/100:null,unallocatedAmount:allocationReady&&!delivered.length?serviceCents/100:null,
  costPerDelivered:allocationReady&&delivered.length?serviceCents/100/delivered.length:null,
  comparativeCostPerOrder:allocationReady&&included.length?serviceCents/100/included.length:null,
  comparativeNonDeliveredCost:allocationReady&&included.length?nonDeliveredCents/100:null,
  comparativeExtraPerDelivered:allocationReady&&delivered.length&&included.length?nonDeliveredCents/100/delivered.length:null,
  orders:orders.map(r=>({...r,costDeliveredOnly:r.outcome==='exchange'?0:onlyDelivered.has(r.order_code)?onlyDelivered.get(r.order_code)!/100:null,costComparative:r.outcome==='exchange'?0:allClosed.has(r.order_code)?allClosed.get(r.order_code)!/100:null})),policy:'delivered_only_with_equal_closed_orders_comparison',
 };
}
