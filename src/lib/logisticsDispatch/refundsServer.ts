import {planningRows} from './planningServer';
import {planningPaymentStates} from './planningPaymentsServer';
import {freightAccountMethod} from './accountPaymentMethod';
import {isUuid,moneyValue} from '@/lib/financialOperations/validation';

export async function freightRefundOptions(db:any,dispatchId:string){
 if(!isUuid(dispatchId))throw new Error('LOG inválido.');
 const query=await db.from('logistics_dispatch_plans').select('*,logistics_dispatches(code,carrier_name,delivery_date)').eq('dispatch_id',dispatchId).single();if(query.error)throw query.error;
 const rows=await planningPaymentStates(db,[query.data]);
 const payments=rows[0].paymentState.payments;
 const ids=payments.filter((p:any)=>p.amount>0).map((p:any)=>p.id);
 const transactions=ids.length?await planningRows(db.from('cash_transactions').select('*').in('id',ids).order('id')):[];
 return {payments:payments.filter((p:any)=>p.amount>0).map((p:any)=>({...p,available:Math.round((p.amount+payments.filter((r:any)=>r.originalPaymentId===p.id).reduce((n:number,r:any)=>n+r.amount,0))*100)/100,transaction:transactions.find((t:any)=>t.id===p.id)})).filter((p:any)=>p.available>0)};
}
export async function saveFreightRefund(db:any,actor:string,body:any){
 if(!isUuid(body.dispatchId)||!isUuid(body.paymentId)||!isUuid(body.requestKey)||!isUuid(body.accountId))throw new Error('Seleccioná el LOG, pago original y cuenta de ingreso.');
 const amount=moneyValue(body.amount)/100,reason=String(body.reason||'').trim();
 if(reason.length<3||reason.length>500)throw new Error('Indicá el motivo de la devolución.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')||!Number.isFinite(Date.parse(body.date))||new Date(body.date).toISOString().slice(0,10)!==body.date)throw new Error('Fecha inválida.');
 const [accounts,methods]=await Promise.all([planningRows(db.from('financial_accounts').select('id,name,type,currency,is_active').eq('id',body.accountId)),planningRows(db.from('payment_methods').select('id,name').order('id'))]);
 if(accounts.length!==1||accounts[0].currency!=='ARS'||!accounts[0].is_active)throw new Error('Elegí una cuenta activa en pesos.');
 const paymentMethodId=freightAccountMethod(body.accountId,accounts,methods);
 const result=await db.rpc('refund_logistics_freight',{p_actor:actor,p_key:body.requestKey,p_dispatch:body.dispatchId,p_payment:body.paymentId,p_version:body.termsVersion||0,p_expected:body.transactionSnapshot,p_input:{amount,reason,date:body.date,accountId:body.accountId,paymentMethodId}});if(result.error)throw result.error;return result.data;
}
