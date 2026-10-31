import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid,openingAmount} from '@/lib/supplierAccount';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};const missing=['42P01','42703','PGRST202','PGRST205'].includes(e.code||'');return NextResponse.json({error:missing?'Falta habilitar la distribución por partidas (migración 250).':e.message||'No se pudo guardar la distribución.'},{status:error instanceof OperationError?error.status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
function source(payment:unknown,credit:unknown){if(Number(isUuid(payment))+Number(isUuid(credit))!==1||payment&&credit)throw new Error('Elegí un pago o una nota de crédito.');return {paymentId:isUuid(payment)?payment:null,creditId:isUuid(credit)?credit:null};}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),params=new URL(request.url).searchParams,{paymentId,creditId}=source(params.get('paymentId'),params.get('creditId'));
 const result=await db.rpc('get_supplier_item_distribution',{p_payment:paymentId,p_credit:creditId});if(result.error)throw result.error;if(!result.data?.source)throw new Error('No se encontró el origen.');
 return NextResponse.json(result.data,{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),body=await request.json(),{paymentId,creditId}=source(body.paymentId,body.creditId);
 if(!isUuid(body.requestId)||typeof body.signature!=='string'||!/^[a-f0-9]{32}$/.test(body.signature)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000||!Array.isArray(body.items)||body.items.length>500)throw new Error('Completá el motivo y elegí hasta 500 partidas.');
 const seen=new Set<string>(),items=body.items.map((item:{itemKey:unknown;amount:unknown})=>{if(!item||typeof item.itemKey!=='string'||!item.itemKey||item.itemKey.length>200||seen.has(item.itemKey))throw new Error('Partida inválida o repetida.');seen.add(item.itemKey);const amount=openingAmount(item.amount);if(amount<=0)throw new Error('Cada importe debe ser positivo.');return {itemKey:item.itemKey,amount:amount.toFixed(2)};});
 const result=await db.rpc('assign_supplier_item_details',{p_actor:actor,p_request:body.requestId,p_payload:{paymentId,creditId,signature:body.signature,reason:body.reason.trim(),items}});if(result.error)throw result.error;
 return NextResponse.json({result:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
