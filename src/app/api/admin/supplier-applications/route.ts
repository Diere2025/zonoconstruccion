import { NextResponse } from 'next/server';
import { supplierAccountContext } from '@/lib/supplierAccounts/server';
import { isUuid, openingAmount, supplierLedger, type AccountEntry, type HistoryChoice, type AccountStart } from '@/lib/supplierAccount';
import { OperationError } from '@/lib/financialOperations/validation';
import { movementCode } from '@/lib/financialOperations/references';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime='edge';
export const dynamic='force-dynamic';
async function all<T>(query:{range:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>}) {
 const rows:T[]=[];for(let offset=0;;offset+=500){const result=await query.range(offset,offset+499);if(result.error)throw result.error;rows.push(...result.data||[]);if(!result.data||result.data.length<500)return rows;}
}
function failure(error:unknown){const e=error as {code?:string;message?:string};const missing=['42P01','PGRST202','PGRST205'].includes(e.code||'');return NextResponse.json({error:missing?'Falta habilitar las aplicaciones de pagos (migración 245).':e.message||'No se pudo aplicar el pago.'},{status:error instanceof OperationError?error.status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}

async function paymentDetail(db:SupabaseClient,supplierId:string,paymentId:string) {
 const sourceKey='payment:'+paymentId;
 const [payment,scope,openingSignature,reservations]=await Promise.all([
  db.rpc('get_supplier_application_payments',{p_supplier:supplierId}).eq('id',paymentId).maybeSingle(),
  db.from('supplier_opening_sources').select('included,reference').eq('supplier_id',supplierId).eq('source_key',sourceKey).maybeSingle(),
  db.rpc('supplier_opening_application_signature',{p_source:sourceKey}),
  db.rpc('supplier_reserved_amount',{p_key:sourceKey}),
 ]);
 for(const result of [payment,scope,openingSignature,reservations])if(result.error)throw result.error;
 if(!payment.data)throw new OperationError('Este pago ya no está disponible.',404);
 const {amount,currency,created_at,cash_transaction_id,signature,allocations}=payment.data;
 const documentIds=(allocations as Array<{purchase_id:string;amount:number|string}>).map(a=>a.purchase_id);
 const [movement,documents,opening]=await Promise.all([
  cash_transaction_id?db.from('cash_transactions').select('id,type,movement_code,concept,notes,financial_accounts(name)')
   .eq('id',cash_transaction_id).maybeSingle():Promise.resolve({data:null,error:null}),
  documentIds.length?db.from('supplier_purchases').select('id,invoice_number,document_type')
   .eq('supplier_id',supplierId).in('id',documentIds):Promise.resolve({data:[],error:null}),
  all<{target_key:string;amount:number|string}>(db.from('supplier_opening_applications').select('target_key,amount')
   .eq('supplier_id',supplierId).eq('source_key',sourceKey).order('target_key')),
 ]);
 for(const result of [movement,documents])if(result.error)throw result.error;
 const parts=opening.length?await all<{item_key:string;reference:string}>(db.from('supplier_opening_parts').select('item_key,reference')
  .eq('supplier_id',supplierId).order('item_key')):[];
 const names=new Map((documents.data||[]).map(doc=>[doc.id,[doc.document_type,doc.invoice_number].filter(Boolean).join(' · ')]));
 const partNames=new Map(parts.map(part=>[part.item_key,part.reference]));
 const account=movement.data?.financial_accounts;
 return {
  code:movement.data?movementCode(movement.data):'PAG-'+paymentId.toUpperCase(),
  amount,currency,date:created_at,signature,included:scope.data?.included===true,
  concept:movement.data?.concept,
  notes:scope.data?.reference && scope.data.reference!=='Pago'?scope.data.reference:movement.data?.notes,
  account:(Array.isArray(account)?account[0]:account)?.name,
  documents:(allocations as Array<{purchase_id:string;amount:number|string}>).map(a=>({...a,reference:names.get(a.purchase_id)||'Documento de compra'})),
  opening:opening.map(a=>({...a,reference:partNames.get(a.target_key)||'Partida de apertura'})),
  openingSignature:openingSignature.data,reserved:Number(reservations.data||0),
 };
}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),params=new URL(request.url).searchParams,supplier=params.get('supplierId');
 const creditHistory=params.get('creditHistory'),paymentHistory=params.get('paymentHistory');
 if(creditHistory||paymentHistory){
  const id=creditHistory||paymentHistory;if(!isUuid(id)||creditHistory&&paymentHistory)throw new Error('Origen inválido.');
  const result=await db.from(creditHistory?'supplier_credit_events':'supplier_payment_application_events').select('id,actor_id,payload,after_value,created_at').eq(creditHistory?'credit_id':'payment_id',id).order('created_at',{ascending:false}).limit(100);
  if(result.error)throw result.error;
  return NextResponse.json({events:result.data},{headers:{'Cache-Control':'no-store'}});
 }
 if(!isUuid(supplier))throw new Error('Proveedor inválido.');
 const paymentId=params.get('paymentId');
 if(paymentId!==null){
  if(!isUuid(paymentId))throw new Error('Pago inválido.');
  return NextResponse.json(await paymentDetail(db,supplier,paymentId),{headers:{'Cache-Control':'no-store'}});
 }
 const [config,entries,choices,payments,purchases,credits,openingApplications,reservations]=await Promise.all([
  db.from('supplier_account_starts').select('*').eq('supplier_id',supplier).maybeSingle(),
  all<AccountEntry>(db.from('supplier_account_entries').select('*').eq('supplier_id',supplier).order('source').order('source_id')),
  all<HistoryChoice>(db.from('supplier_account_history').select('*').eq('supplier_id',supplier).order('source').order('source_id')),
  all<{id:string;amount:number|string;currency:string;created_at:string;cash_transaction_id:string|null;signature:string;allocations:Array<{purchase_id:string;amount:number|string}>}>(db.rpc('get_supplier_application_payments',{p_supplier:supplier})),
  all<{id:string;invoice_number:string;total_amount:number|string;paid_amount:number|string;credit_applied_amount:number|string;currency:string;status:string;document_type:string|null;purchase_date:string}>(db.rpc('get_supplier_application_documents',{p_supplier:supplier})),
  all<{id:string;invoice_number:string;amount:number|string;currency:string;purchase_date:string;signature:string;allocations:Array<{purchase_id:string;amount:number|string}>}>(db.rpc('get_supplier_application_credits',{p_supplier:supplier})),
  all<{id:string;source_key:string;amount:number|string}>(db.from('supplier_opening_applications').select('id,source_key,amount').eq('supplier_id',supplier).order('id')),
  all<{payment_id:string;amount:number|string}>(db.from('supplier_payment_reservations').select('payment_id,order_id,amount,supplier_payments!inner(supplier_id)').eq('supplier_payments.supplier_id',supplier).order('payment_id').order('order_id'))
 ]);
 if(config.error)throw config.error;
 const ledger=supplierLedger(config.data as AccountStart|null,entries,choices),eligible=new Set(ledger.rows.filter(r=>r.included).map(r=>r.source+':'+r.source_id));
 const openingUsed=(key:string)=>openingApplications.filter(a=>a.source_key===key).reduce((n,a)=>n+Math.round(Number(a.amount)*100),0)/100;
 const recentPayments=payments.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id));
 const recentCredits=credits.sort((a,b)=>Date.parse(b.purchase_date)-Date.parse(a.purchase_date)||b.id.localeCompare(a.id));
 return NextResponse.json({configured:!!config.data,payments:recentPayments.map(p=>({...p,included:eligible.has('payment:'+p.id),opening_applied:openingUsed('payment:'+p.id),reserved_amount:reservations.filter(r=>r.payment_id===p.id).reduce((n,r)=>n+Math.round(Number(r.amount)*100),0)/100,applied:p.allocations.reduce((n,a)=>n+Math.round(Number(a.amount)*100),0)/100+openingUsed('payment:'+p.id)})),
 credits:recentCredits.map(c=>({...c,kind:'credit',created_at:c.purchase_date,cash_transaction_id:null,included:eligible.has('purchase:'+c.id),opening_applied:openingUsed('credit:'+c.id),applied:c.allocations.reduce((n,a)=>n+Math.round(Number(a.amount)*100),0)/100+openingUsed('credit:'+c.id)})),
 purchases:purchases.map(p=>({...p,included:eligible.has('purchase:'+p.id)}))},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),body=await request.json();
 const credit=!!body.creditId;
 if(!isUuid(body.requestId)||!isUuid(credit?body.creditId:body.paymentId)||body.creditId&&body.paymentId||typeof body.signature!=='string'||!/^[a-f0-9]{32}$/.test(body.signature)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000||!Array.isArray(body.allocations)||body.allocations.length>100)throw new Error('Datos de aplicación inválidos.');
 const seen=new Set<string>();const allocations=body.allocations.map((a:{purchase_id:unknown;amount:unknown})=>{if(!isUuid(a.purchase_id)||seen.has(a.purchase_id))throw new Error('Documento inválido o repetido.');seen.add(a.purchase_id);const amount=openingAmount(a.amount);if(amount<=0)throw new Error('El importe aplicado debe ser positivo.');return {purchase_id:a.purchase_id,amount:amount.toFixed(2)};});
 const result=await db.rpc(credit?'apply_supplier_credit':'reapply_supplier_payment',{p_actor:actor,p_request:body.requestId,p_payload:{[credit?'creditId':'paymentId']:credit?body.creditId:body.paymentId,signature:body.signature,reason:body.reason.trim(),allocations}});
 if(result.error)throw result.error;return NextResponse.json({result:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
