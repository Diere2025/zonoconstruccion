import {calculateRealDispatchCosts} from './costs';
import {movementHref,movementCode} from '@/lib/financialOperations/references';
type Row = Record<string, any>;
export function explicitMovementLog(notes: unknown): string | null {
 const codes = [...new Set(String(notes || '').toUpperCase().match(/(?<![A-Z0-9_])LOG_REC_\d+[A-Z]?(?![A-Z0-9_])/g) || [])];
 return codes.length === 1 ? codes[0] : null;
}
export function reconcilePaymentStates(plans: Row[], reconciled: Row[]) {
 if(!reconciled.length)return plans;
 const affectedIds=new Set(reconciled.map(r=>r.transactionId));
 return plans.map(p=>{
  if(p.local)return p;
  const original=(p.paymentState?.payments||[]).filter((t:Row)=>!affectedIds.has(t.id)).map((t:Row)=>({transaction_id:t.id,method:t.linkMethod,cash_transactions:{...t,type:'egreso',currency:'ARS',category:'Servicio de Flete',created_at:t.date,movement_code:t.code,financial_accounts:{name:t.account}}}));
  const correctedLinks=reconciled.filter(r=>r.dispatchId===p.dispatch_id).map(r=>({transaction_id:r.transactionId,purpose:'freight_fee',method:'source_verified_local',cash_transactions:r.transaction}));
  const paymentState=dispatchPaymentState(p,[...original,...correctedLinks]);
  paymentState.reversedPaymentCount=Math.max(paymentState.reversedPaymentCount,p.paymentState?.reversedPaymentCount||0);
  if(p.paymentState?.unsupportedCurrencyCount){paymentState.unsupportedCurrencyCount=p.paymentState.unsupportedCurrencyCount;paymentState.state='needs_review';paymentState.liquidated=false;}
  return {...p,paymentState:{...paymentState,basis:'reconciled_source',sourceReviewLocal:true}};
 });
}
/** Payment is derived from normalized LOG → movement links, never from a tariff estimate or rendition. */
export function dispatchPaymentState(plan: Row, links: Row[], reversedIds = new Set<string>(), approvedAmount: number | null = null) {
 const costs = calculateRealDispatchCosts([], links, reversedIds);
 const paidAmount = costs.paidAmount;
 const expectedAmount = approvedAmount ?? (Number(plan.planned?.agreedAmount) > 0 ? Number(plan.planned.agreedAmount) : null);
 const difference=paidAmount!==null&&expectedAmount!==null?Math.round((paidAmount-expectedAmount)*100)/100:null;
 const minorDifference=difference!==null&&difference!==0&&paidAmount!>0&&Math.abs(difference)<100?difference:null;
 const partial = paidAmount !== null && expectedAmount !== null && Math.round(paidAmount * 100) < Math.round(expectedAmount * 100)&&minorDifference===null;
 const state = costs.status === 'needs_review' ? 'needs_review' : paidAmount === null ? 'unpaid' : partial ? 'partial' : 'paid';
 const transactions = new Map<string, Row>();
 for (const link of links) {const tx = Array.isArray(link.cash_transactions) ? link.cash_transactions[0] : link.cash_transactions; if (tx) transactions.set(tx.id, tx);}
 return {
  state, liquidated: plan.status === 'completed' && state === 'paid', paidAmount, expectedAmount,
  remainingAmount: expectedAmount === null ? null : minorDifference!==null?0:Math.max(0, Math.round((expectedAmount - (paidAmount || 0)) * 100) / 100),minorDifference,
  basis: 'posted_freight', reversedPaymentCount: costs.reversedPaymentCount,
  unsupportedCurrencyCount: costs.unsupportedCurrencyCount,
  payments: costs.payments.map(p => {const tx = transactions.get(p.id), account = Array.isArray(tx?.financial_accounts) ? tx.financial_accounts[0] : tx?.financial_accounts; return {...p,code:movementCode({id:p.id,type:tx?.type||'egreso',movement_code:tx?.movement_code}),href:movementHref(p.id),account:account?.name || '',concept:tx?.concept || '',linkMethod:links.find(l=>l.transaction_id===p.id)?.method || '',reference:explicitMovementLog(tx?.notes)};})
 };
}

/** Unconfirmed source matches block another payment, but never change posted amounts. */
export function paymentSourceReviewIssues(preview: {rows: Row[]; issues: Row[]}) {
 return [...preview.issues,...preview.rows.map(r=>({code:r.source.code,row:r.source.row,amount:r.source.amount,paymentDate:r.source.date,transactionId:r.transactionId,message:'Pago localizado en Caja; confirmar el vínculo o el desglose antes de imputarlo al LOG.'}))];
}
