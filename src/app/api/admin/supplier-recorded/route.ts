import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isUuid,isAccountDate} from '@/lib/supplierAccount';
import {recordedSupplierLedger} from '@/lib/supplierAccounts/recorded';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),params=new URL(request.url).searchParams,supplierId=params.get('supplierId'),day=params.get('day');
 if(!isUuid(supplierId)||!isAccountDate(day))throw new Error('Proveedor o fecha inválidos.');
 const r=await db.rpc('get_supplier_recorded_state',{p_supplier:supplierId,p_day:day});if(r.error)throw r.error;
 return NextResponse.json({...r.data,...recordedSupplierLedger(r.data.states,day)},{headers:{'Cache-Control':'no-store'}});
}catch(error){const e=error as {code?:string;message?:string};return NextResponse.json({error:['42P01','PGRST202'].includes(e.code||'')?'Falta habilitar la historia registrada (migración 255).':e.message||'No se pudo consultar el estado registrado.'},{status:error instanceof OperationError?error.status:400});}}
