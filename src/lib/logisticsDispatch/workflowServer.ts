import {freightAccountMethod} from './accountPaymentMethod';
import {planningRows} from './planningServer';
import {validateNovelty} from './novelties';
import {validateOperation} from '@/lib/financialOperations/validation';
import historicalReview from './historicalCircuitDrafts.json';
type Row=Record<string,any>;
export async function freightWorkflowData(db:any,finance:boolean){
 let novelties:Row[]=[];let available=true;
 try{novelties=await planningRows(db.from('logistics_freight_novelties').select('*,logistics_freight_novelty_applications(dispatch_id,amount)').order('origin_date',{ascending:false}));}catch(e:any){if(!['42P01','PGRST205'].includes(e.code))throw e;available=false;}
 const [accounts,methods]=finance?await Promise.all([planningRows(db.from('financial_accounts').select('id,name,type,currency,is_active').eq('is_active',true).eq('currency','ARS').order('name')),planningRows(db.from('payment_methods').select('id,name').order('name'))]):[[],[]];
 return {workflowAvailable:available,...(process.env.NODE_ENV==='development'&&finance?{historicalDrafts:historicalReview.drafts}:{}),novelties:novelties.map(n=>({...n,remainingAmount:Math.round((Number(n.amount)-(n.logistics_freight_novelty_applications||[]).reduce((s:number,a:Row)=>s+Number(a.amount),0))*100)/100})),freightAccounts:accounts,freightPaymentMethods:methods};
}
export async function saveFreightWorkflow(db:any,actor:string,body:Row){
 const permission=await db.rpc('can_manage_financial_operations',{p_user_id:actor});if(permission.error)throw permission.error;if(permission.data!==true)throw Object.assign(new Error('Sin permiso de Tesorería.'),{status:403});
 if(body.action==='save-freight-novelty'){
  const input=validateNovelty(body);if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.id||''))throw new Error('Identificación de novedad inválida.');
  const r=await db.rpc('save_logistics_freight_novelty',{p_actor:actor,p_id:body.id,p_input:input});if(r.error)throw r.error;return r.data;
 }
 const [accounts,methods]=await Promise.all([planningRows(db.from('financial_accounts').select('id,name,type,currency,is_active').eq('id',body.payload?.account_id)),planningRows(db.from('payment_methods').select('id,name').order('name'))]);
 const payload={...body.payload,payment_method_id:freightAccountMethod(body.payload?.account_id,accounts,methods)};
 validateOperation(payload);
 const r=await db.rpc('pay_logistics_freight',{p_actor:actor,p_key:body.requestKey,p_payload:payload,p_rows:body.allocations});if(r.error)throw r.error;return r.data;
}
