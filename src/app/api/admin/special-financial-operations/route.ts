import {withInternalPaymentMethod} from '@/lib/financialOperations/formDefaults';
import {NextResponse} from 'next/server';
import {financialContext} from '@/lib/financialOperations/server';
import {buildSpecialPlan,type SpecialInput,type Resources} from '@/lib/financialOperations/specialized';
import {isUuid,OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function fail(e:unknown){const x=e as {code?:string;message?:string};return json({error:e instanceof OperationError?e.message:['42P01','PGRST205','PGRST202'].includes(x.code||'')?'Los circuitos nuevos están preparados; falta activar su migración.':x.message||'No se pudo procesar la operación.'},e instanceof OperationError?e.status:x.code==='40001'||x.code==='23505'?409:400);}
async function resources(db:Awaited<ReturnType<typeof financialContext>>['db']):Promise<Resources>{
 const read=async(table:string)=>{const rows=[];for(let offset=0;;offset+=500){const r=await db.from(table).select('*').order('id').range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if(!r.data||r.data.length<500)return rows;}};
 const [accounts,funds,loans,counts]=await Promise.all([read('financial_accounts'),read('financial_custody_funds'),read('financial_financing'),read('financial_cash_counts')]);return {accounts,funds,loans,counts};
}
export async function GET(request:Request){try{
 const {db,actor}=await financialContext(request);const u=new URL(request.url);
 if(u.searchParams.has('account_id')){
  const id=u.searchParams.get('account_id'),cutoff=u.searchParams.get('cutoff');if(!isUuid(id)||!cutoff||!Number.isFinite(Date.parse(cutoff))||Date.parse(cutoff)>Date.now())throw new OperationError('Cuenta o corte inválido.');
  const r=await db.rpc('financial_account_cut',{p_account:id,p_cutoff:cutoff});
  if(r.error?.code==='PGRST202'){
   const rows=[];for(let offset=0;;offset+=500){const page=await db.from('cash_transactions').select('id,type,amount,currency,created_at').eq('financial_account_id',id).lte('created_at',cutoff).order('id').range(offset,offset+499);if(page.error)throw page.error;rows.push(...(page.data||[]));if(!page.data||page.data.length<500)break;}
   const history=await db.from('cash_transactions').select('id').eq('financial_account_id',id).limit(1);if(history.error)throw history.error;
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rows)));const fingerprint=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
   const cents=rows.reduce((sum,row)=>sum+(row.type==='ingreso'?1:-1)*Math.round(Number(row.amount)*100),0);return json({balance:(cents/100).toFixed(2),fingerprint,has_history:Boolean(history.data?.length),preview_only:true});
  }
  if(r.error)throw r.error;return json(r.data);
 }
 if(u.searchParams.has('operation_id')||u.searchParams.has('transaction_id')){
  let id=u.searchParams.get('operation_id');
  if(!id){const tid=u.searchParams.get('transaction_id');if(!isUuid(tid))throw new OperationError('Movimiento inválido.');const tx=await db.from('cash_transactions').select('operation_id').eq('id',tid).single();if(tx.error)throw tx.error;id=tx.data.operation_id;}
  if(!isUuid(id))throw new OperationError('Operación inválida.');
  const r=await db.from('financial_operations').select('id,operation_type,detail,version,status').eq('id',id).single();if(r.error)throw r.error;return json({operation:r.data});
 }
 try{const r=await resources(db);const ops=await db.from('financial_operations').select('id,operation_type,detail,version,status').in('operation_type',['custody_fund','currency_exchange','financing','partner_equity','asset_trade','cash_count']).order('created_at',{ascending:false}).order('id').limit(100);if(ops.error)throw ops.error;const permission=actor?await db.rpc('can_manage_financial_operations',{p_user_id:actor}):{data:false,error:null};if(permission.error)throw permission.error;return json({available:true,can_write:Boolean(permission.data),...r,operations:ops.data});}catch(e){const error=e as {code:string;message:string};if(['42P01','PGRST205'].includes(error.code)&&/financial_(custody_funds|financing|cash_counts)/.test(error.message))return json({available:false,funds:[],loans:[],counts:[],operations:[]});throw e;}
}catch(e){return fail(e);}}
function canonical(v:unknown):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';return JSON.stringify(v);}
export async function POST(request:Request){try{
 const {db,actor}=await financialContext(request,true),body=await request.json();if(!isUuid(body.key))throw new OperationError('Solicitud inválida.');
 if(body.action==='cancel'){
  if(!isUuid(body.operation_id)||!Number.isInteger(body.version)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>1000)throw new OperationError('Referencia o motivo inválido.');
  const r=await db.rpc('cancel_special_financial_operation',{p_actor:actor,p_key:body.key,p_operation:body.operation_id,p_version:body.version,p_reason:body.reason});if(r.error)throw r.error;return json({result:r.data});
 }
 if(!body.payload||body.action!=='save')throw new OperationError('Solicitud inválida.');
 const methods=await db.from('payment_methods').select('id,name').order('id');if(methods.error)throw methods.error;
 const input=withInternalPaymentMethod(body.payload as SpecialInput,methods.data||[]);
 const prior=await db.from('financial_operation_requests').select('action,payload,result').eq('actor_id',actor).eq('request_key',body.key).maybeSingle();if(prior.error)throw prior.error;
 if(prior.data){if(prior.data.action!=='special.save'||canonical(prior.data.payload)!==canonical(input))throw new OperationError('La solicitud ya fue usada con otros datos.',409);return json({result:prior.data.result});}
 const r=await resources(db);let cut;
 if(input.operation_type==='cash_count'){
  const count=r.counts.find(c=>c.id===input.resource_id);const cutoff=input.action==='adjust'?count?.cutoff:input.cutoff;
  if(!cutoff)throw new OperationError('Elegí el corte del arqueo.');
  const result=await db.rpc('financial_account_cut',{p_account:input.account_id,p_cutoff:cutoff});if(result.error)throw result.error;cut=result.data;
 }
 const plan=buildSpecialPlan(input,r,cut);
 if(input.operation_type==='asset_trade'&&input.action==='purchase'){
  const purchase=await db.from('supplier_purchases').select('id').eq('invoice_number',input.reference!.trim()).limit(1);if(purchase.error)throw purchase.error;
  if(purchase.data?.length)throw new OperationError('Ese documento ya está registrado en Compras. Usá Pago a proveedor para cancelarlo.');
 }
 const result=await db.rpc('persist_special_financial_operation',{p_actor:actor,p_key:body.key,p_input:input,p_plan:plan});if(result.error)throw result.error;return json({result:result.data});
}catch(e){return fail(e);}}
