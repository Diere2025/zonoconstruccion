import {NextResponse} from 'next/server';
import {financialContext} from '@/lib/financialOperations/server';
import {isUuid,OperationError} from '@/lib/financialOperations/validation';
import {validateCryptoEntry} from '@/lib/cryptoReconciliation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function fail(error:unknown) {
  const dbError = error as {code?:string;message?:string};
  if (error instanceof OperationError) return NextResponse.json({error:error.message},{status:error.status});
  if (dbError.code === 'PGRST202') return NextResponse.json({error:'Falta activar la conciliación de Binance y Redot en la base de datos.'},{status:503});
  if (dbError.code === '42501') return NextResponse.json({error:'No tenés permisos para esta operación financiera.'},{status:403});
  if (dbError.code === 'P0001' || dbError.code === '23505') {
    return NextResponse.json({error:dbError.message},{status:dbError.code === '23505' ? 409 : 400});
  }
  console.error('Error de conciliación Binance y Redot',dbError.code);
  return NextResponse.json({error:'No se pudo procesar la conciliación.'},{status:500});
}

export async function GET(request:Request) {
  try {
    const {db,actor} = await financialContext(request,true);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 100000) throw new OperationError('Página inválida.');
    const {data,error} = await db.rpc('read_crypto_reconciliation',{p_actor:actor,p_offset:page*50});
    if (error) throw error;
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request:Request) {
  try {
    const {db,actor} = await financialContext(request,true);
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.id)) throw new OperationError('Solicitud inválida.');
    if (body.action === 'void') {
      if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) {
        throw new OperationError('Ingresá un motivo de anulación.');
      }
      const {error} = await db.rpc('void_crypto_reconciliation_entry',{p_actor:actor,p_id:body.id,p_reason:body.reason});
      if (error) throw error;
    } else if (body.action === 'save') {
      const {error} = await db.rpc('save_crypto_reconciliation_entry',{
        p_actor:actor,p_id:body.id,p_entry:validateCryptoEntry(body.entry),
      });
      if (error) throw error;
    } else {
      throw new OperationError('Solicitud inválida.');
    }
    return NextResponse.json({ok:true});
  } catch (error) {
    return fail(error);
  }
}
