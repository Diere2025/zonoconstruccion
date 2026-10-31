import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid,openingAmount} from '@/lib/supplierAccount';
import {OperationError} from '@/lib/financialOperations/validation';
import {supplierPosition} from '@/lib/supplierAccounts/position';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};const missing=['42P01','PGRST202','PGRST205'].includes(e.code||'');return NextResponse.json({error:missing?'Falta habilitar aplicaciones a apertura (migración 253).':e.message||'No se pudo aplicar a apertura.'},{status:error instanceof OperationError?error.status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),supplierId=new URL(request.url).searchParams.get('supplierId');if(!isUuid(supplierId))throw new Error('Proveedor inválido.');
 const [result,balance]=await Promise.all([db.rpc('get_supplier_opening_workspace',{p_supplier:supplierId}),db.rpc('get_supplier_account_balances').eq('id',supplierId).maybeSingle()]);if(result.error)throw result.error;if(balance.error)throw balance.error;
 const summary=balance.data as {start_date:string|null;balance_ars:number|string;balance_usd:number|string}|null;
 return NextResponse.json({...result.data,position:summary?.start_date?supplierPosition(result.data,{balance_ars:Number(summary.balance_ars),balance_usd:Number(summary.balance_usd)}):null},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),body=await request.json();
 if(!isUuid(body.requestId)||typeof body.sourceKey!=='string'||!body.sourceKey||body.sourceKey.length>120||typeof body.signature!=='string'||!/^[a-f0-9]{32}$/.test(body.signature)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000||!Array.isArray(body.allocations)||body.allocations.length>500)throw new Error('Datos de aplicación inválidos.');
 const seen=new Set<string>();const allocations=body.allocations.map((a:{targetKey:unknown;amount:unknown})=>{if(!a||typeof a.targetKey!=='string'||!a.targetKey||a.targetKey.length>120||seen.has(a.targetKey))throw new Error('Destino inválido o repetido.');seen.add(a.targetKey);const amount=openingAmount(a.amount);if(amount<=0||amount>=1e12)throw new Error('El importe debe ser positivo con hasta dos decimales.');return {targetKey:a.targetKey,amount:amount.toFixed(2)};});
 const result=await db.rpc('save_supplier_opening_applications',{p_actor:actor,p_request:body.requestId,p_payload:{sourceKey:body.sourceKey,signature:body.signature,reason:body.reason.trim(),allocations}});if(result.error)throw result.error;return NextResponse.json({result:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
