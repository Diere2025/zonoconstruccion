import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { isAccountDate, isUuid, openingAmount, supplierLedger, type AccountEntry, type AccountStart, type HistoryChoice } from '@/lib/supplierAccount';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function access(request: Request) {
  const denied = await requireFinanceAdmin(request);
  if (denied) return { response: NextResponse.json({ error: denied.error }, { status: denied.status }) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: NextResponse.json({ error: 'La sesión venció.' }, { status: 401 }) };
  return { db, user };
}

// Supabase limits each response. Read every page so historical selection and balances never truncate.
async function allRows<T>(query: { range: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
const failure = (error: unknown, status = 500) => {
  const code = (error as { code?: string })?.code;
  const message = ['42P01', '42703', 'PGRST202', 'PGRST205'].includes(code || '')
    ? 'Falta habilitar cuentas corrientes de proveedores en la base de datos (migraciones 112 y 113).'
    : error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudo actualizar la cuenta corriente.';
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: Request) {
  try {
    const context = await access(request);
    if (context.response) return context.response;
    const { db } = context;
    const supplierId = new URL(request.url).searchParams.get('supplierId');
    if (!supplierId) {
      const data = await allRows(db.rpc('get_supplier_account_balances'));
      return NextResponse.json({ suppliers: data });
    }
    if (!isUuid(supplierId)) return failure(new Error('Proveedor inválido.'), 400);
    const [config, entries, history] = await Promise.all([
      db.from('supplier_account_starts').select('*').eq('supplier_id', supplierId).maybeSingle(),
      allRows(db.from('supplier_account_entries').select('*').eq('supplier_id', supplierId).order('entry_date').order('source').order('source_id')),
      allRows(db.from('supplier_account_history').select('*').eq('supplier_id', supplierId).order('source').order('source_id'))
    ]);
    if (config.error) throw config.error;
    const start = config.data as AccountStart | null;
    return NextResponse.json({ start, ...supplierLedger(start, entries as AccountEntry[], history as HistoryChoice[]) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const context = await access(request);
    if (context.response) return context.response;
    const { db, user } = context;
    const body = await request.json();
    if (!isUuid(body.supplierId)) return failure(new Error('Proveedor inválido.'), 400);
    const audit = { updated_by: user.id, updated_at: new Date().toISOString() };
    if (body.action === 'start') {
      if (!isAccountDate(body.startDate)) return failure(new Error('Fecha de inicio inválida.'), 400);
      let ars: number; let usd: number;
      try { ars = openingAmount(body.openingArs); usd = openingAmount(body.openingUsd); } catch (error) { return failure(error, 400); }
      if (typeof body.notes !== 'string' || !body.notes.trim()) return failure(new Error('Anotá el criterio del punto de partida.'), 400);
      const { error } = await db.from('supplier_account_starts').upsert({ supplier_id: body.supplierId, start_date: body.startDate,
        opening_ars: ars, opening_usd: usd, notes: body.notes.trim(), ...audit });
      if (error) throw error;
    } else if (body.action === 'history') {
      if (!['purchase', 'payment'].includes(body.source) || !isUuid(body.sourceId) || typeof body.included !== 'boolean'
        || typeof body.notes !== 'string' || !body.notes.trim()) return failure(new Error('Seleccioná el documento y anotá el motivo de conciliación.'), 400);
      const [entry, start] = await Promise.all([
        db.from('supplier_account_entries').select('source_id,voided').eq('supplier_id', body.supplierId).eq('source', body.source).eq('source_id', body.sourceId).maybeSingle(),
        db.from('supplier_account_starts').select('supplier_id').eq('supplier_id', body.supplierId).maybeSingle()
      ]);
      if (entry.error) throw entry.error;
      if (start.error) throw start.error;
      if (!start.data || !entry.data || entry.data.voided) return failure(new Error('Configurá el punto de partida y elegí un documento vigente del proveedor.'), 400);
      const { error } = await db.from('supplier_account_history').upsert({ supplier_id: body.supplierId, source: body.source, source_id: body.sourceId,
        included: body.included, notes: body.notes.trim(), ...audit });
      if (error) throw error;
    } else if (body.action === 'receipt') {
      if (!isUuid(body.id) || (body.poId && !isUuid(body.poId)) || !isAccountDate(body.date) || !['ARS','USD'].includes(body.currency)
        || typeof body.stock !== 'boolean' || typeof body.close !== 'boolean' || !Array.isArray(body.items) || body.items.length === 0) return failure(new Error('Datos de recepción incompletos.'), 400);
      for (const item of body.items) {
        if (!item || (item.poItemId && !isUuid(item.poItemId)) || (item.productId && !isUuid(item.productId))
          || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0) return failure(new Error('Cantidad, costo o artículo inválidos.'), 400);
      }
      const { data, error } = await db.rpc('register_supplier_receipt', {
        p_id: body.id, p_supplier: body.supplierId, p_po: body.poId || null, p_slip: String(body.slip || ''),
        p_date: body.date, p_currency: body.currency, p_stock: body.stock, p_close: body.close,
        p_notes: String(body.notes || ''), p_items: body.items, p_user: user.id
      });
      if (error) throw error;
      return NextResponse.json({ id: data });
    } else return failure(new Error('Operación inválida.'), 400);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
