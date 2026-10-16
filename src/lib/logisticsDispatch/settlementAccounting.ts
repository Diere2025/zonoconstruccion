type Row = Record<string, any>;
export type SettlementDeduction = {label: string; amount: number; kind: 'discount' | 'offset'; reference: string; noveltyId?:string};
const cents = (v: unknown) => {
 const n = Number(v);
 if (v === null || v === '' || !Number.isFinite(n) || n < 0 || n > 100000000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new Error('Usá importes válidos con hasta dos decimales.');
 return Math.round(n * 100);
};
export function validateSettlementTerms(input: Row) {
 const gross = cents(input.grossAmount);
 if (!gross) throw new Error('Confirmá el valor del servicio antes de calcular el saldo.');
 if (!Array.isArray(input.deductions) || input.deductions.length > 30) throw new Error('Revisá los descuentos.');
 const deductions: SettlementDeduction[] = input.deductions.map((d: Row) => {
  const label = String(d.label || '').trim(), reference = String(d.reference || '').trim(), amount = cents(d.amount);
  if (!label || label.length > 300 || !amount || !['discount','offset'].includes(d.kind) || reference.length > 500) throw new Error('Cada descuento o compensación necesita motivo e importe válidos. La referencia es opcional y admite hasta 500 caracteres.');
  if(d.noveltyId&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(d.noveltyId))throw new Error('Novedad inválida.');
  return {label, amount: amount / 100, kind: d.kind, reference,...(d.noveltyId?{noveltyId:d.noveltyId}:{})};
 });
 const deducted = deductions.reduce((n,d) => n + Math.round(d.amount * 100), 0);
 if (deducted > gross) throw new Error('Los descuentos no pueden superar el valor del servicio.');
 const evidence = String(input.evidence || '').trim();
 if (!evidence || evidence.length > 2000) throw new Error('Registrá el acuerdo o la evidencia que respalda el importe.');
 return {grossAmount:gross/100, deductions, netAmount:(gross-deducted)/100, evidence};
}
export function validatePaymentAllocation(input: Row, movementAmount: number) {
 if (!Array.isArray(input.allocations) || input.allocations.length < 1 || input.allocations.length > 50) throw new Error('Indicá los servicios que cubre el pago.');
 const seen = new Set<string>();
 const allocations = input.allocations.map((a: Row) => {
  const code = String(a.code || '').trim().toUpperCase(), amount = cents(a.amount), reason = String(a.reason || '').trim();
  if (!/^LOG_REC_\d+[A-Z]?$/.test(code) || seen.has(code) || !amount || !reason || reason.length > 500) throw new Error('Cada LOG debe ser único, con importe positivo y motivo.');
  seen.add(code); return {code, amount:amount/100, reason};
 });
 if (allocations.reduce((n: number,a: Row) => n + Math.round(a.amount * 100),0) !== cents(movementAmount)) throw new Error('El desglose debe sumar exactamente el importe del movimiento.');
 return allocations;
}
/** Explicit allocations replace the old full-payment association, including across periods. */
export function mergeAllocatedPayments(links: Row[], allocations: Row[]): Row[] {
 const allocated = new Set(allocations.map(a => a.transaction_id));
 return [...links.filter(l => !allocated.has(l.transaction_id)), ...allocations.map(a => ({...a,purpose:'freight_fee',method:'reviewed_allocation',allocated_amount:Number(a.amount)}))];
}
export function applySettlementTerms(plans: Row[], terms: Row[], fees: Row[] = []): Row[] {
 const adjusted=plans.map(p => {
  const term = terms.find(t => t.dispatch_id === p.dispatch_id);
  if (!term) return p;
  const state = p.paymentState || {}, expected = Number(term.net_amount), paid = state.paidAmount ?? 0;
  const difference=Math.round((paid-expected)*100)/100,minorDifference=paid>0&&difference!==0&&Math.abs(difference)<100?difference:null;
  const remaining = minorDifference!==null?0:Math.max(0, -difference), settled = remaining === 0;
  return {...p,settlementTerms:term,paymentState:{...state,expectedAmount:expected,remainingAmount:remaining,minorDifference,overpaidAmount:Math.max(0,difference),state:state.state === 'needs_review'?'needs_review':settled?'paid':paid>0?'partial':'unpaid',liquidated:p.status==='completed'&&settled&&state.state!=='needs_review'}};
 });
 return adjusted.map(p=>{
  const extras=p.actual?.extras||[],term=terms.find(t=>t.dispatch_id===p.dispatch_id),fee=fees.find(f=>(f.dispatchId||f.dispatch_id)===p.dispatch_id);
  const approved=term?.extra_snapshot??(fee?.additions||fee?.fee?.additions||[]).filter((a:Row)=>a.extraId).map((a:Row)=>({...a,id:a.extraId}));
  const same=(a:Row,b:Row)=>a.id===b.id&&Number(a.amount)===Number(b.amount)&&a.label===b.label&&a.reference===b.reference;
  const pending=extras.filter((e:Row)=>!approved.some((a:Row)=>same(a,e)));
  const changed=approved.some((a:Row)=>!extras.some((e:Row)=>same(a,e)));
  const review=p.status==='completed'&&(pending.length>0||changed);
  const extraChargesDelta=extras.reduce((n:number,e:Row)=>n+Number(e.amount),0)-approved.reduce((n:number,e:Row)=>n+Number(e.amount),0);
  return {...p,extraChargesPending:pending,extraChargesDelta,extrasNeedReview:review,paymentState:review?{...p.paymentState,state:'needs_review',liquidated:false}:p.paymentState};
 });
}
