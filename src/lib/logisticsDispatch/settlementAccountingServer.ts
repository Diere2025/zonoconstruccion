import {planningRows} from './planningServer';
import {mergeAllocatedPayments,validatePaymentAllocation,validateSettlementTerms} from './settlementAccounting';
type Row=Record<string,any>;
const missingTable=(e:any)=>['42P01','PGRST205'].includes(e?.code);
export async function allocationLinks(db:any,links:Row[],dispatchIds:string[],columns:string){
 const allocations:Row[]=[];
 try {
  for(let i=0;i<dispatchIds.length;i+=150)allocations.push(...await planningRows(db.from('logistics_freight_payment_allocations').select(`*,cash_transactions(${columns})`).in('dispatch_id',dispatchIds.slice(i,i+150)).order('transaction_id')));
  // An original full-payment link can belong to a different date/LOG than the allocations.
  const ids=[...new Set(links.map(l=>l.transaction_id))].filter(id=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id));
  const occupied=new Set(allocations.map(a=>a.transaction_id));
  for(let i=0;i<ids.length;i+=150){const rows=await planningRows(db.from('logistics_freight_payment_allocations').select('transaction_id').in('transaction_id',ids.slice(i,i+150)).order('transaction_id'));rows.forEach(r=>occupied.add(r.transaction_id));}
  const merged=mergeAllocatedPayments(links.filter(l=>!occupied.has(l.transaction_id)),allocations);
  try{for(let i=0;i<dispatchIds.length;i+=150){const refunds=await planningRows(db.from('logistics_freight_refunds').select(`*,cash_transactions!transaction_id(${columns})`).in('dispatch_id',dispatchIds.slice(i,i+150)).order('transaction_id'));merged.push(...refunds.map((r:Row)=>({...r,purpose:'freight_refund',refund_payment_id:r.payment_transaction_id})));}}catch(e){if(!missingTable(e))throw e;}
  return merged;
 }catch(e){if(missingTable(e))return links;throw e;}
}
export async function settlementTerms(db:any,ids:string[]){
 const rows:Row[]=[];try{for(let i=0;i<ids.length;i+=150)rows.push(...await planningRows(db.from('logistics_freight_settlement_terms').select('*').in('dispatch_id',ids.slice(i,i+150)).order('dispatch_id')));return rows;}catch(e){if(missingTable(e))return [];throw e;}
}
export async function dispatchCostTerms(db:any,ids:string[]):Promise<Row[]>{
 if(!ids.length)return [];
 const terms=await settlementTerms(db,ids),fees:Row[]=[],plans:Row[]=[];
 try{for(let i=0;i<ids.length;i+=150){
  const chunk=ids.slice(i,i+150);
  fees.push(...await planningRows(db.from('logistics_dispatch_liquidations').select('dispatch_id,total,fee').in('dispatch_id',chunk).order('dispatch_id')));
  plans.push(...await planningRows(db.from('logistics_dispatch_plans').select('dispatch_id,actual').in('dispatch_id',chunk).order('dispatch_id')));
 }}catch(e){if(!missingTable(e))throw e;}
 return ids.flatMap(id=>{
  const term=terms.find(t=>t.dispatch_id===id),fee=fees.find(f=>f.dispatch_id===id);if(!term&&!fee)return [];
  const extras=plans.find(p=>p.dispatch_id===id)?.actual?.extras||[];
  const snapshot=term?.extra_snapshot??(fee?.fee?.additions||[]).filter((a:Row)=>a.extraId).map((a:Row)=>({...a,id:a.extraId}));
  const same=(a:Row,b:Row)=>a.id===b.id&&Number(a.amount)===Number(b.amount)&&a.label===b.label&&a.reference===b.reference;
  const pending=extras.length!==snapshot.length||extras.some((e:Row)=>!snapshot.some((s:Row)=>same(e,s)));
  return [{...(term||{dispatch_id:id,gross_amount:Number(fee!.total),deductions:[]}),cost_pending:pending}];
 });
}
export async function paymentForAllocation(db:any,code:string){
 if(!/^PAG-\d+$/.test(code))throw new Error('Indicá el código PAG del movimiento registrado.');
 const rows=await planningRows(db.from('cash_transactions').select('id,movement_code,type,amount,currency,category,sub_category,concept,notes,created_at,reversal_of_transaction_id').eq('movement_code',code).order('id'));
 const tx=rows[0];
 if(rows.length!==1||tx.type!=='egreso'||tx.currency!=='ARS'||Number(tx.amount)<=0||tx.reversal_of_transaction_id||![tx.category,tx.sub_category].some(v=>String(v||'').trim().toLowerCase()==='servicio de flete'))throw new Error('El código debe identificar un pago activo de Servicio de Flete en pesos.');
 const reversed=await db.from('cash_transactions').select('id').eq('reversal_of_transaction_id',tx.id).limit(1);if(reversed.error)throw reversed.error;if(reversed.data?.length)throw new Error('El movimiento fue revertido.');
 let allocations:Row[]=[];try{allocations=await planningRows(db.from('logistics_freight_payment_allocations').select('*,logistics_dispatches(code)').eq('transaction_id',tx.id).order('dispatch_id'));}catch(e){if(!missingTable(e))throw e;}
 return {transaction:tx,allocations};
}
export async function saveSettlementAccounting(db:any,actor:string,body:Row){
 const permission=await db.rpc('can_manage_financial_operations',{p_user_id:actor});if(permission.error)throw permission.error;if(permission.data!==true)throw Object.assign(new Error('Sin permiso de Tesorería para confirmar saldos o distribuir pagos.'),{status:403});
 if(body.action==='accept-freight-difference'){
  const r=await db.rpc('accept_logistics_freight_difference',{p_actor:actor,p_dispatch:body.dispatchId,p_version:body.termsVersion,p_paid:body.paidAmount,p_reason:String(body.reason||'').trim()});if(r.error)throw r.error;return r.data;
 }
 if(body.action==='save-settlement-terms'){
  const terms=validateSettlementTerms(body);
  const r=await db.rpc('save_logistics_freight_settlement_terms',{p_actor:actor,p_dispatch:body.dispatchId,p_version:body.termsVersion??0,p_terms:{...terms,extraSnapshot:body.extraSnapshot||[]}});if(r.error)throw r.error;return r.data;
 }
 const fresh=await paymentForAllocation(db,String(body.movementCode||'').trim());
 if(fresh.transaction.id!==body.transactionId||Number(fresh.transaction.amount)!==Number(body.movementAmount))throw new Error('El movimiento cambió. Volvé a consultarlo.');
 if(!body.transactionSnapshot||['id','movement_code','type','currency','category','sub_category','concept','notes','created_at','reversal_of_transaction_id'].some(key=>fresh.transaction[key]!==body.transactionSnapshot[key]))throw new Error('El movimiento cambió. Volvé a consultarlo.');
 const allocations=validatePaymentAllocation(body,Number(fresh.transaction.amount));
 const r=await db.rpc('allocate_logistics_freight_payment',{p_actor:actor,p_transaction:fresh.transaction.id,p_expected:fresh.transaction,p_previous:body.previousAllocations||[],p_rows:allocations});if(r.error)throw r.error;return r.data;
}
