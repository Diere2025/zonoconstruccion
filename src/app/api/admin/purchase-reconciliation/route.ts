import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePurchaseOperator } from '@/lib/purchaseAccess';
import { isUuid } from '@/lib/supplierAccount';
import { validateSupplierBill } from '@/lib/purchaseReconciliation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
async function context(request: Request) {
  const denied = await requirePurchaseOperator(request);
  if (denied) return { response: NextResponse.json({ error: denied.error }, { status: denied.status }) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: NextResponse.json({ error: 'La sesión venció.' }, { status: 401 }) };
  return { db, user };
}
async function all<T>(query: { range: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}> }) {
  const rows: T[] = [];
  for (let offset = 0;; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 500) return rows;
  }
}
function failure(error: unknown, status = 400) {
  const e = error as {code?: string; message?: string};
  const missing = ['42P01', '42703', 'PGRST200', 'PGRST202', 'PGRST205'].includes(e?.code || '');
  return NextResponse.json({ error: missing ? 'Falta habilitar la conciliación de compras (migración 219).' : e?.message || 'No se pudo guardar la conciliación.' }, { status: missing ? 503 : status });
}
export async function GET(request: Request) {
  try {
    const access = await context(request);
    if (access.response) return access.response;
    const supplier = new URL(request.url).searchParams.get('supplierId');
    if (supplier && !isUuid(supplier)) return failure(new Error('Proveedor inválido.'));
    const receiptsQuery = access.db.from('purchase_receptions').select('id,supplier_id,delivery_slip_number,reception_date,currency,supplier:suppliers(name)').order('reception_date', {ascending:false}).order('id');
    const itemsQuery = access.db.from('purchase_reception_items').select('id,purchase_reception_id,product_name,product_id,quantity_received,unit_cost,purchase_order_item_id,product:products(name,sku),order:purchase_order_items(unit_cost,purchase_orders(oc_code)),purchase_receptions!inner(supplier_id)').order('id');
    const billsQuery = access.db.from('supplier_bills').select('*,supplier:suppliers(name)').order('bill_date', {ascending:false}).order('id');
    // Page lines separately: nested PostgREST collections can silently truncate large bills.
    const linesQuery = access.db.from('supplier_bill_lines').select('*,supplier_bills!inner(supplier_id)').order('id');
    const [receiptRows, items, bills, lines] = await Promise.all([
      all(supplier ? receiptsQuery.eq('supplier_id', supplier) : receiptsQuery),
      all(supplier ? itemsQuery.eq('purchase_receptions.supplier_id', supplier) : itemsQuery),
      all(supplier ? billsQuery.eq('supplier_id', supplier) : billsQuery),
      all(supplier ? linesQuery.eq('supplier_bills.supplier_id', supplier) : linesQuery)
    ]);
    const byReceipt = new Map<string, typeof items>();
    for (const item of items) {const group=byReceipt.get(item.purchase_reception_id)||[];group.push(item);byReceipt.set(item.purchase_reception_id,group);}
    return NextResponse.json({receipts:receiptRows.map(r=>({...r,items:byReceipt.get(r.id)||[]})), bills, lines});
  } catch (error) { return failure(error, 500); }
}
export async function POST(request: Request) {
  try {
    const access = await context(request);
    if (access.response) return access.response;
    const body = await request.json();
    let payload;
    if (body?.void === true) {
      if (!isUuid(body.id) || !isUuid(body.requestId) || !isUuid(body.supplierId) || !Number.isSafeInteger(body.version) || body.version<1
        || typeof body.resolution !== 'string' || !body.resolution.trim() || body.resolution.length>4000) return failure(new Error('Anotá el motivo de anulación.'));
      payload = {id:body.id,requestId:body.requestId,supplierId:body.supplierId,version:body.version,void:true,resolution:body.resolution.trim()};
    } else payload = validateSupplierBill(body);
    const {data, error} = await access.db.rpc('save_supplier_bill', {p_payload:payload,p_user:access.user.id});
    if (error) return failure(error, error.code==='23505' ? 409 : 400);
    return NextResponse.json({id:data});
  } catch (error) { return failure(error); }
}
