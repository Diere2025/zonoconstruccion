import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid} from '@/lib/supplierAccount';
import {validateOpeningDetail} from '@/lib/supplierAccounts/opening';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};const missing=['42P01','42703','PGRST202','PGRST205'].includes(e.code||'');return NextResponse.json({error:missing?'Falta habilitar el desglose de apertura (migración 252).':e.message||'No se pudo guardar el desglose.'},{status:error instanceof OperationError?error.status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),supplierId=new URL(request.url).searchParams.get('supplierId');if(!isUuid(supplierId))throw new Error('Proveedor inválido.');
 const result=await db.rpc('get_supplier_opening_detail',{p_supplier:supplierId});if(result.error)throw result.error;if(!result.data?.start)throw new Error('Definí el punto de partida antes de detallar la apertura.');
 return NextResponse.json(result.data,{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),body=await request.json(),payload=validateOpeningDetail(body);
 const result=await db.rpc('save_supplier_opening_detail',{p_actor:actor,p_request:body.requestId,p_payload:payload});if(result.error)throw result.error;
 return NextResponse.json({result:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
