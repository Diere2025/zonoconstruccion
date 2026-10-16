import {allocationLinks} from './settlementAccountingServer';
import {planningRows} from './planningServer';
import {dispatchPaymentState,explicitMovementLog} from './planningPayments';
type Row = Record<string, any>;
export async function planningPaymentStates(db: any, plans: Row[]) {
 const ids = [...new Set(plans.map(p=>p.dispatch_id))];
 const links: Row[] = [];
 // No payment-date filter: a trip can be paid days later or in multiple movements.
 const columns = 'id,type,amount,currency,category,sub_category,concept,notes,created_at,movement_code,reversal_of_transaction_id,financial_accounts(name)';
 for (let i=0;i<ids.length;i+=150) links.push(...await planningRows(db.from('logistics_dispatch_movements').select(`*,cash_transactions(${columns})`).in('dispatch_id',ids.slice(i,i+150)).order('transaction_id')));
 const byCode = new Map<string,string>();
 for (const plan of plans) {const header=Array.isArray(plan.logistics_dispatches)?plan.logistics_dispatches[0]:plan.logistics_dispatches;if(header?.code)byCode.set(header.code,plan.dispatch_id);}
 const codes = [...byCode.keys()], candidates = new Map<string,Row>();
 // Explicit owner confirmation: Osuna's separate 23/09 trip, already paid.
 if(byCode.has('LOG_REC_05395B')){
  const reviewed=await planningRows(db.from('cash_transactions').select(columns).eq('movement_code','PAG-0000004278').order('id'));
  if(reviewed.length===1&&reviewed[0].id==='a24830f6-48ef-46e9-b6b9-b6908071408a'&&reviewed[0].type==='egreso'&&reviewed[0].currency==='ARS'&&Number(reviewed[0].amount)===40000){
   for(let i=links.length-1;i>=0;i--)if(links[i].transaction_id===reviewed[0].id)links.splice(i,1);
   links.push({dispatch_id:byCode.get('LOG_REC_05395B'),transaction_id:reviewed[0].id,purpose:'freight_fee',method:'owner_reviewed',cash_transactions:reviewed[0]});
  }
 }
 for (let i=0;i<codes.length;i+=25) {
  const query = codes.slice(i,i+25).map(code=>`notes.ilike.%${code}%`).join(',');
  const rows = await planningRows(db.from('cash_transactions').select(columns).eq('type','egreso').or(query).order('id'));
  rows.forEach(row=>candidates.set(row.id,row));
 }
 const assigned = new Map<string,string>();
 const candidateIds = [...candidates.keys()];
 for (let i=0;i<candidateIds.length;i+=150) {
  const rows=await planningRows(db.from('logistics_dispatch_movements').select('transaction_id,dispatch_id').in('transaction_id',candidateIds.slice(i,i+150)).order('transaction_id'));
  rows.forEach(row=>assigned.set(row.transaction_id,row.dispatch_id));
 }
 // Read-only compatibility bridge for existing movements. The accompanying migration
 // persists these exact references in the same FK table; it never creates another payment.
 for (const tx of candidates.values()) {
  const code=explicitMovementLog(tx.notes), dispatchId=code&&byCode.get(code);
  if(!dispatchId || assigned.has(tx.id))continue;
  links.push({dispatch_id:dispatchId,transaction_id:tx.id,method:'movement_log_reference',cash_transactions:tx});
 }
 const effectiveLinks=await allocationLinks(db,links,ids,columns);
 const transactions = [...new Set(effectiveLinks.flatMap(l=>{const tx=Array.isArray(l.cash_transactions)?l.cash_transactions[0]:l.cash_transactions;return tx?.id?[tx.id]:[];}))];
 const reversed = new Set<string>();
 for (let i=0;i<transactions.length;i+=150) {
  const rows = await planningRows(db.from('cash_transactions').select('id,reversal_of_transaction_id').in('reversal_of_transaction_id',transactions.slice(i,i+150)).order('id'));
  rows.forEach(r=>reversed.add(r.reversal_of_transaction_id));
 }
 return plans.map(p=>({...p,paymentState:dispatchPaymentState(p,effectiveLinks.filter(l=>l.dispatch_id===p.dispatch_id),reversed)}));
}
