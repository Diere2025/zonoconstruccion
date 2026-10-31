import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid} from '@/lib/supplierAccount';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};return NextResponse.json({error:e.message||'No se pudo revisar la equivalencia.'},{status:error instanceof OperationError?error.status:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),rows:unknown[]=[];for(let offset=0;;offset+=500){const r=await db.from('supplier_source_aliases').select('*').order('id').range(offset,offset+499);if(r.error)throw r.error;rows.push(...r.data||[]);if(!r.data||r.data.length<500)break;}
 return NextResponse.json({aliases:rows},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),b=await request.json();
 if(!isUuid(b.requestId)||!isUuid(b.supplierId)||!Number.isInteger(b.version)||b.version<0||typeof b.sourceBook!=='string'||!/^[a-zA-Z0-9_-]{10,120}$/.test(b.sourceBook)||typeof b.sourceAlias!=='string'||!b.sourceAlias.trim()||b.sourceAlias.length>200||!['proposed','verified','rejected'].includes(b.status)||b.condition!==null&&!['facturado','por_remito','historico'].includes(b.condition)||typeof b.businessLabel!=='string'||b.businessLabel.length>100||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>2000)throw new Error('Completá proveedor, etiqueta y motivo.');
 const r=await db.rpc('review_supplier_alias',{p_actor:actor,p_request:b.requestId,p_payload:{sourceBook:b.sourceBook,sourceAlias:b.sourceAlias,supplierId:b.supplierId,status:b.status,condition:b.condition,businessLabel:b.businessLabel.trim(),reason:b.reason.trim(),version:b.version}});if(r.error)throw r.error;return NextResponse.json({alias:r.data});
}catch(error){return failure(error);}}
