import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid,openingAmount} from '@/lib/supplierAccount';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};return NextResponse.json({error:e.message||'No se pudo reservar el anticipo.'},{status:error instanceof OperationError?error.status:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),id=new URL(request.url).searchParams.get('paymentId');if(!isUuid(id))throw new Error('Pago inválido.');const r=await db.rpc('get_supplier_reservations',{p_payment:id});if(r.error)throw r.error;if(!r.data?.source)throw new Error('No se encontró el pago vigente.');return NextResponse.json(r.data,{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),b=await request.json();if(!isUuid(b.paymentId)||!isUuid(b.requestId)||typeof b.signature!=='string'||!/^[a-f0-9]{32}$/.test(b.signature)||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>2000||!Array.isArray(b.reservations)||b.reservations.length>100)throw new Error('Reserva inválida.');
 const seen=new Set<string>(),reservations=b.reservations.map((r:{orderId:unknown;amount:unknown})=>{if(!isUuid(r.orderId)||seen.has(r.orderId))throw new Error('OC inválida o repetida.');seen.add(r.orderId);const amount=openingAmount(r.amount);if(amount<=0||amount>=1e12)throw new Error('Importe de reserva inválido.');return {orderId:r.orderId,amount:amount.toFixed(2)};});
 const r=await db.rpc('save_supplier_reservations',{p_actor:actor,p_request:b.requestId,p_payload:{paymentId:b.paymentId,signature:b.signature,reason:b.reason.trim(),confirmOrderCurrency:b.confirmOrderCurrency===true,reservations}});if(r.error)throw r.error;return NextResponse.json({result:r.data});
}catch(error){return failure(error);}}
