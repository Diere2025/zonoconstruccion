import {NextResponse} from 'next/server';
import {supplierAccountContext} from '@/lib/supplierAccounts/server';
import {isAccountDate,isUuid,openingAmount} from '@/lib/supplierAccount';
import {OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {db}=await supplierAccountContext(request),p=new URL(request.url).searchParams,supplier=p.get('supplierId'),day=p.get('day'),currency=p.get('currency'),amount=openingAmount(p.get('amount'));
 if(!isUuid(supplier)||!isAccountDate(day)||!['ARS','USD'].includes(currency||'')||amount<=0||amount>=1e12)throw new Error('Parámetros de distribución inválidos.');
 const r=await db.rpc('plan_supplier_account_fifo',{p_supplier:supplier,p_currency:currency,p_amount:amount,p_day:day});if(r.error)throw r.error;return NextResponse.json(r.data,{headers:{'Cache-Control':'no-store'}});
}catch(error){return NextResponse.json({error:(error as Error).message||'No se pudo calcular la propuesta.'},{status:error instanceof OperationError?error.status:400});}}
