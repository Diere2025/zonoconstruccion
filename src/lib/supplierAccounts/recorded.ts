import {supplierLedger,type AccountStart,type AccountEntry,type HistoryChoice} from '../supplierAccount';
type State={kind:string;value:Record<string,unknown>|null};
export function recordedSupplierLedger(states:State[],day:string){
 const start=states.find(s=>s.kind==='start'&&s.value)?.value as AccountStart|null||null;
 const choices=states.filter(s=>s.kind==='history'&&s.value).map(s=>s.value as HistoryChoice);
 const entries:AccountEntry[]=states.filter(s=>['purchase','payment'].includes(s.kind)&&s.value).map(s=>{
  const p=s.value!,purchase=s.kind==='purchase',credit=p.document_type==='Nota de Crédito';
  return {supplier_id:String(p.supplier_id),source:purchase?'purchase':'payment',source_id:String(p.id),entry_date:String(p.entry_date),currency:p.currency as 'ARS'|'USD',reference:purchase?String(p.invoice_number||'Sin número'):'Pago registrado',kind:purchase?String(p.document_type||'Documento'):'Pago',amount:Number(purchase?p.total_amount:p.amount)*(purchase&&!credit?1:-1),voided:purchase?p.status==='Anulado':!!p.reversed_at,notes:String(p.notes||''),purchase_order_id:p.purchase_order_id as string|null,purchase_reception_id:p.purchase_reception_id as string|null,cash_transaction_id:p.cash_transaction_id as string|null};
 });
 return {start,...supplierLedger(start,entries,choices,{to:day})};
}
