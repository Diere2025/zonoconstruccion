import {planningRows} from './planningServer';
import {freightPaymentCandidates} from './paymentCandidates';

export async function availableFreightPayments(db:any,dispatchId:string){
 if(!/^[a-f0-9-]{36}$/i.test(dispatchId))throw new Error('LOG inválido.');
 const result=await db.from('logistics_dispatch_plans').select('*,logistics_dispatches(code,carrier_name,delivery_date)').eq('dispatch_id',dispatchId).single();if(result.error)throw result.error;
 const plan=result.data,header=Array.isArray(plan.logistics_dispatches)?plan.logistics_dispatches[0]:plan.logistics_dispatches;
 const day=new Date(header.delivery_date+'T12:00:00Z'),boundary=(offset:number)=>new Date(day.getTime()+offset*86400000).toISOString().slice(0,10);
 const columns='id,movement_code,type,amount,currency,category,sub_category,concept,notes,created_at,reversal_of_transaction_id,financial_accounts(name)';
 const [recent,referenced]=await Promise.all([
  planningRows(db.from('cash_transactions').select(columns).eq('type','egreso').eq('currency','ARS').or('category.eq.Servicio de Flete,sub_category.eq.Servicio de Flete').gte('created_at',boundary(-30)+'T00:00:00-03:00').lt('created_at',boundary(31)+'T00:00:00-03:00').order('id')),
  planningRows(db.from('cash_transactions').select(columns).eq('type','egreso').eq('currency','ARS').ilike('notes','%'+header.code+'%').order('id'))
 ]);
 const transactions=[...new Map([...recent,...referenced].map(t=>[t.id,t])).values()],occupied=new Set<string>(),reversed=new Set<string>();
 for(let i=0;i<transactions.length;i+=150){const ids=transactions.slice(i,i+150).map(t=>t.id);const [links,allocations,reversals]=await Promise.all([
  planningRows(db.from('logistics_dispatch_movements').select('transaction_id').in('transaction_id',ids).order('transaction_id')),
  planningRows(db.from('logistics_freight_payment_allocations').select('transaction_id').in('transaction_id',ids).order('transaction_id')),
  planningRows(db.from('cash_transactions').select('reversal_of_transaction_id').in('reversal_of_transaction_id',ids).order('id'))
 ]);[...links,...allocations].forEach(t=>occupied.add(t.transaction_id));reversals.forEach(t=>reversed.add(t.reversal_of_transaction_id));}
 return {rows:freightPaymentCandidates(transactions,plan,occupied,reversed),from:boundary(-30),to:boundary(30)};
}
