import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid,openingAmount} from '@/lib/supplierAccount';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};return NextResponse.json({error:e.message||'No se pudo preparar la puesta al día.'},{status:error instanceof OperationError?error.status:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),p=new URL(request.url).searchParams,supplier=p.get('supplierId'),batch=p.get('batchId');if(!isUuid(supplier)||batch&&!isUuid(batch))throw new Error('Proveedor o captura inválidos.');
 if(!batch){const [batches,events]=await Promise.all([db.from('supplier_import_batches').select('id,cutoff_date').order('created_at',{ascending:false}).limit(100),db.from('supplier_cutover_events').select('id,created_at,payload,after_value').eq('supplier_id',supplier).order('created_at',{ascending:false}).limit(30)]);if(batches.error)throw batches.error;if(events.error)throw events.error;return NextResponse.json({batches:batches.data,events:events.data},{headers:{'Cache-Control':'no-store'}});}
 const r=await db.rpc('get_supplier_cutover_review',{p_supplier:supplier,p_batch:batch});if(r.error)throw r.error;return NextResponse.json(r.data,{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),b=await request.json();if(!isUuid(b.requestId)||typeof b.reason!=='string'||b.reason.trim().length<10||b.reason.length>2000||!['apply','reverse'].includes(b.action))throw new Error('Completá el criterio del corte o su reversión.');
 let payload;if(b.action==='reverse'){if(!isUuid(b.eventId))throw new Error('Corte inválido.');payload={eventId:b.eventId,reason:b.reason.trim()};}else{if(!isUuid(b.supplierId)||!isUuid(b.batchId)||typeof b.signature!=='string'||!/^[a-f0-9]{32}$/.test(b.signature)||b.approved!==true||typeof b.differenceEvidence!=='string'||b.differenceEvidence.length>2000)throw new Error('Revisá y aprobá la captura completa con su respaldo de diferencias.');payload={supplierId:b.supplierId,batchId:b.batchId,signature:b.signature,openingArs:openingAmount(b.openingArs).toFixed(2),openingUsd:openingAmount(b.openingUsd).toFixed(2),approved:true,reason:b.reason.trim(),differenceEvidence:b.differenceEvidence.trim()};}
 const r=await db.rpc(b.action==='reverse'?'reverse_supplier_reviewed_cutover':'apply_supplier_reviewed_cutover',{p_actor:actor,p_request:b.requestId,p_payload:payload});if(r.error)throw r.error;return NextResponse.json({result:r.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
