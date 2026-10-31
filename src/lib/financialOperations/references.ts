export type ApplicationReference = { id: string; code: string; kind: string; href: string; amount?: number };
export type CodedMovement = { id: string; type: string; movement_code?: string | null };
export function movementCode(row: CodedMovement): string {
  return row.movement_code || `${row.type === 'ingreso' ? 'COB' : 'PAG'}-${row.id.toUpperCase()}`;
}
export const movementHref = (id: string) => `/admin/finanzas?tab=flow&transaction=${encodeURIComponent(id)}`;
export const purchaseHref = (id: string) => `/admin/compras?tab=purchases_history&purchase=${encodeURIComponent(id)}`;
export function supplierCreditReferences(allocations:Array<{credit_id:string;purchase_id:string;amount:number|string}>,purchases:Array<{id:string;invoice_number:string;document_type?:string;status?:string}>) {
 const documents=new Map(purchases.map(p=>[p.id,p]));const result=new Map<string,ApplicationReference[]>();
 for(const allocation of allocations){const credit=documents.get(allocation.credit_id),target=documents.get(allocation.purchase_id);if(!credit||!target||credit.status==='Anulado'||target.status==='Anulado')continue;
  result.set(target.id,[...result.get(target.id)||[],{id:credit.id,code:credit.invoice_number||credit.id,kind:'Nota de crédito',href:purchaseHref(credit.id),amount:Number(allocation.amount)}]);
  result.set(credit.id,[...result.get(credit.id)||[],{id:target.id,code:target.invoice_number||target.id,kind:'Documento compensado',href:purchaseHref(target.id),amount:Number(allocation.amount)}]);
 }
 return result;
}
export function supplierApplications(allocations: Array<{ payment_id: string; purchase_id: string; amount: number | string }>,
  payments: Array<{ id: string; cash_transaction_id: string | null; reversed_at?: string | null }>,
  purchases: Array<{ id: string; invoice_number: string; document_type?: string }>, movements: CodedMovement[]) {
  const paymentMap = new Map(payments.map(row => [row.id, row]));
  const purchaseMap = new Map(purchases.map(row => [row.id, row]));
  const movementMap = new Map(movements.map(row => [row.id, row]));
  const byPayment = new Map<string, ApplicationReference[]>(), byPurchase = new Map<string, ApplicationReference[]>();
  for (const allocation of allocations) {
    const payment = paymentMap.get(allocation.payment_id), purchase = purchaseMap.get(allocation.purchase_id);
    if (!payment || payment.reversed_at || !purchase) continue;
    const movement = payment.cash_transaction_id ? movementMap.get(payment.cash_transaction_id) : undefined;
    const amount = Number(allocation.amount);
    const documents = byPayment.get(payment.id) || [], applications = byPurchase.get(purchase.id) || [];
    documents.push({ id: purchase.id, code: purchase.invoice_number || purchase.id, kind: ['Remito','Recepción'].includes(purchase.document_type || '') ? 'Recepción' : 'Comprobante', href: purchaseHref(purchase.id), amount });
    applications.push({ id: payment.id, code: movement ? movementCode(movement) : `PAG-${payment.id.toUpperCase()}`, kind: 'Pago', href: movement ? movementHref(movement.id) : '', amount });
    byPayment.set(payment.id, documents); byPurchase.set(purchase.id, applications);
  }
  return { byPayment, byPurchase };
}

// All order associations count, including references imported with bank statements.
export function movementOrderReferences(row: {applications?:ApplicationReference[];client_payments?:Array<{order_id?:string|null;reversed_at?:string|null;orders?:{id?:string;legacy_code?:string|null}|null}>}): ApplicationReference[] {
 const result=new Map<string,ApplicationReference>();
 for(const payment of row.client_payments||[]){const id=payment.order_id||payment.orders?.id;if(id&&!payment.reversed_at)result.set(id,{id,code:payment.orders?.legacy_code||id,kind:'Pedido',href:`/admin/finanzas?tab=flow&order=${id}`});}
 for(const ref of row.applications||[])if(ref.kind==='Pedido')result.set(ref.id,ref);
 return Array.from(result.values());
}
