import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid} from '@/lib/supplierAccount';
import {validateSupplierService} from '@/lib/supplierAccounts/service';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};const missing=['42P01','PGRST202','PGRST205'].includes(e.code||'');return NextResponse.json({error:missing?'Falta habilitar servicios sin recepción (migración 254).':e.message||'No se pudo guardar el servicio.'},{status:error instanceof OperationError?error.status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),supplierId=new URL(request.url).searchParams.get('supplierId');if(!isUuid(supplierId))throw new Error('Proveedor inválido.');
 const rows:unknown[]=[];for(let offset=0;;offset+=500){const r=await db.from('supplier_service_documents').select('*,bill:supplier_bills!inner(id,supplier_id,number,bill_date,due_date,currency,declared_total,status,version)').eq('bill.supplier_id',supplierId).order('bill_id').range(offset,offset+499);if(r.error)throw r.error;rows.push(...r.data||[]);if(!r.data||r.data.length<500)break;}
 return NextResponse.json({documents:rows},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),payload=validateSupplierService(await request.json());
 const result=await db.rpc('save_supplier_service',{p_actor:actor,p_payload:payload});if(result.error)throw result.error;return NextResponse.json({id:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
