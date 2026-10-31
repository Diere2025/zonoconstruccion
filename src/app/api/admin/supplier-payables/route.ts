import { NextResponse } from 'next/server';
import { supplierAccountContext } from '@/lib/supplierAccounts/server';
import { isUuid, isAccountDate } from '@/lib/supplierAccount';
import { payableSummary, validateBillSchedule, type PayableItem } from '@/lib/supplierAccounts/payables';
import { treasuryToday } from '@/lib/treasuryTransactionTime';
import { OperationError } from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {code?:string;message?:string};const missing=['42P01','PGRST202','PGRST205'].includes(e.code||'');return NextResponse.json({error:missing?'Falta habilitar partidas y vencimientos (migración 249).':e.message||'No se pudo consultar las partidas.'},{status:error instanceof OperationError?error.status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});}
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),params=new URL(request.url).searchParams,billId=params.get('billId');
 if(billId){
  if(!isUuid(billId))throw new Error('Comprobante inválido.');
  const [bill,installments,signature,events]=await Promise.all([
   db.from('supplier_bills').select('id,number,document_type,bill_date,due_date,currency,declared_total,status').eq('id',billId).single(),
   db.from('supplier_bill_installments').select('number,due_date,amount').eq('bill_id',billId).order('number'),
   db.rpc('supplier_bill_schedule_signature',{p_bill:billId}),
   db.from('supplier_bill_schedule_events').select('id,payload,created_at').eq('bill_id',billId).order('created_at',{ascending:false}).limit(100)
  ]);
  for(const result of [bill,installments,signature,events])if(result.error)throw result.error;
  return NextResponse.json({bill:bill.data,installments:installments.data,signature:signature.data,events:events.data},{headers:{'Cache-Control':'no-store'}});
 }
 const supplier=params.get('supplierId'),asOf=params.get('asOf')||treasuryToday();if(!isUuid(supplier)||!isAccountDate(asOf))throw new Error('Proveedor o fecha inválidos.');
 const items:PayableItem[]=[];
 for(let offset=0;;offset+=500){const result=await db.from('supplier_payable_items').select('*').eq('supplier_id',supplier).order('purchase_id').order('item_key').range(offset,offset+499);if(result.error)throw result.error;items.push(...result.data||[]);if(!result.data||result.data.length<500)break;}
 return NextResponse.json({items,asOf,...payableSummary(items,asOf)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,actor}=await supplierAccountContext(request),{requestId,payload}=validateBillSchedule(await request.json());
 const result=await db.rpc('save_supplier_bill_schedule',{p_actor:actor,p_request:requestId,p_payload:payload});if(result.error)throw result.error;
 return NextResponse.json({result:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
