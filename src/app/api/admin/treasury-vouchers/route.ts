import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BUCKET = 'treasury-vouchers';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};
const CATEGORIES = new Set(['collection', 'third_party_collection', 'owner_withdrawal', 'ads', 'owner_bill', 'supplier', 'order', 'other']);
const STATUSES = new Set(['pending', 'reviewed', 'needs_info']);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function authorize(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!url || !anonKey || !serviceKey || !token) return null;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) return null;
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: permissionError } = await db.rpc('can_manage_treasury_settlements', { p_user_id: user.id });
  if (permissionError || !allowed) return null;
  return { db, user };
}

function optionalText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() || null : null;
}

export async function GET(request: NextRequest) {
  const context = await authorize(request);
  if (!context) return jsonError('No tenés acceso a comprobantes de tesorería.', 403);
  const { db } = context;
  const lookup = request.nextUrl.searchParams.get('lookup');
  if (lookup) {
    const query = (request.nextUrl.searchParams.get('q') || '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
    if (query.length < 2) return NextResponse.json({ success: true, options: [] });
    let result;
    if (lookup === 'orders') {
      result = await db.from('orders').select('id,legacy_code,customer_name,order_date')
        .or(`legacy_code.ilike.%${query}%,customer_name.ilike.%${query}%`).order('created_at', { ascending: false }).limit(40);
    } else if (lookup === 'clients') {
      result = await db.from('clients').select('id,business_name,phone_primary')
        .or(`business_name.ilike.%${query}%,phone_primary.ilike.%${query}%`).order('business_name').limit(40);
    } else if (lookup === 'suppliers') {
      result = await db.from('suppliers').select('id,name').ilike('name', `%${query}%`).order('name').limit(40);
    } else {
      return jsonError('Búsqueda inválida.');
    }
    if (result.error) return jsonError(result.error.message, 500);
    return NextResponse.json({ success: true, options: result.data || [] });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const { data: voucher, error } = await db.from('treasury_vouchers').select('*,treasury_voucher_orders(order_id)').eq('id', id).maybeSingle();
    if (error || !voucher) return jsonError('No se encontró el comprobante.', 404);
    const files = await Promise.all((Array.isArray(voucher.files) ? voucher.files : []).map(async (file: { path: string; name: string }) => {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(file.path, 300);
      return { ...file, url: data?.signedUrl || null };
    }));
    return NextResponse.json({ success: true, voucher: { ...voucher, files, order_ids: (voucher.treasury_voucher_orders || []).map((link: { order_id: string }) => link.order_id) } });
  }

  const [vouchers, accounts, suppliers, orders, clients] = await Promise.all([
    db.from('treasury_vouchers').select('*,treasury_voucher_orders(order_id)').order('voucher_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
    db.from('financial_accounts').select('id,name,currency').eq('is_active', true).order('name'),
    db.from('suppliers').select('id,name').order('name').limit(200),
    db.from('orders').select('id,legacy_code,customer_name,order_date').order('created_at', { ascending: false }).limit(200),
    db.from('clients').select('id,business_name,phone_primary').order('business_name').limit(200)
  ]);
  const error = vouchers.error || accounts.error || suppliers.error || orders.error || clients.error;
  if (error) return jsonError(error.message, 500);
  const visibleFiles = (vouchers.data || []).map(voucher => {
    const files = Array.isArray(voucher.files) ? voucher.files : [];
    return files.find((file: { mime?: string }) => file.mime?.startsWith('image/')) || files[0];
  });
  const paths = [...new Set(visibleFiles.map(file => file?.path).filter((path): path is string => typeof path === 'string'))];
  const signedUrls = new Map<string, string>();
  if (paths.length) {
    const { data: signed, error: signedError } = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    if (signedError) console.warn('[treasury-vouchers] No se pudieron firmar las miniaturas:', signedError.message);
    for (const file of signed || []) if (file.path && file.signedUrl) signedUrls.set(file.path, file.signedUrl);
  }
  return NextResponse.json({
    success: true,
    vouchers: (vouchers.data || []).map((voucher, index) => ({
      ...voucher,
      files: (Array.isArray(voucher.files) ? voucher.files : []).map((file: { path: string }) => ({ ...file, url: file.path === visibleFiles[index]?.path ? signedUrls.get(file.path) || null : null })),
      order_ids: (voucher.treasury_voucher_orders || []).map((link: { order_id: string }) => link.order_id)
    })),
    accounts: accounts.data || [],
    suppliers: suppliers.data || [],
    orders: orders.data || [],
    clients: clients.data || []
  });
}

export async function POST(request: NextRequest) {
  const context = await authorize(request);
  if (!context) return jsonError('No tenés acceso a comprobantes de tesorería.', 403);
  const { db, user } = context;
  const form = await request.formData();
  const existingId = optionalText(form.get('voucherId'));
  const { data: existing, error: existingError } = existingId
    ? await db.from('treasury_vouchers').select('id,files').eq('id', existingId).maybeSingle()
    : { data: null, error: null };
  if (existingError || (existingId && !existing)) return jsonError('No se encontró el comprobante a modificar.', 404);
  const category = optionalText(form.get('category'));
  if (!category || !CATEGORIES.has(category)) return jsonError('Elegí un tipo de comprobante.');
  let orderIds: string[];
  try {
    const parsed = JSON.parse(optionalText(form.get('orderIds')) || '[]');
    if (!Array.isArray(parsed) || parsed.length > 20 || parsed.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error();
    orderIds = [...new Set(parsed)];
  } catch {
    return jsonError('Los pedidos vinculados no son válidos.');
  }
  const fileValues = form.getAll('files');
  const files = fileValues.filter((value): value is File => value instanceof File && value.size > 0);
  const currentFiles = Array.isArray(existing?.files) ? existing.files : [];
  if ((!existingId && !files.length) || currentFiles.length + files.length > 5) return jsonError('Adjuntá entre 1 y 5 imágenes o PDF en total.');
  for (const file of files) {
    if (!ALLOWED_TYPES[file.type] || file.size > (file.type === 'application/pdf' ? MAX_FILE_BYTES : 2 * 1024 * 1024)) {
      return jsonError('Cada imagen debe pesar hasta 2 MB y cada PDF hasta 10 MB.');
    }
  }
  const rawAmount = optionalText(form.get('amount'));
  const amount = rawAmount === null ? null : Number(rawAmount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return jsonError('El importe no es válido.');
  const voucherDate = optionalText(form.get('voucherDate'));
  if (!voucherDate || !/^\d{4}-\d{2}-\d{2}$/.test(voucherDate)) return jsonError('Indicá una fecha válida.');
  const currency = optionalText(form.get('currency')) || 'ARS';
  if (!['ARS', 'USD'].includes(currency)) return jsonError('La moneda no es válida.');
  const movementDirection = category === 'collection' || category === 'third_party_collection' ? 'income' : 'outflow';
  const clientId = optionalText(form.get('clientId'));
  const supplierId = optionalText(form.get('supplierId'));
  const destinationAccount = optionalText(form.get('destinationAccount'));
  if (category === 'collection' && !optionalText(form.get('accountId'))) return jsonError('Elegí la cuenta donde ingresó la cobranza.');
  if (category === 'collection' && !clientId && !orderIds.length) return jsonError('Vinculá un cliente o pedido para la cobranza.');
  if (category === 'third_party_collection' && !clientId && !orderIds.length) return jsonError('Vinculá un cliente o pedido para la cobranza por cuenta y orden.');
  if (category === 'third_party_collection' && !supplierId && !destinationAccount) return jsonError('Indicá el proveedor o la cuenta de tercero que recibió el dinero.');
  if (category === 'ads' && amount === null) return jsonError('Indicá el importe del pago de publicidad.');

  const id = existingId || crypto.randomUUID();
  const uploaded: Array<{ path: string; name: string; mime: string; size: number }> = [];
  let recordSaved = false;
  try {
    for (const file of files) {
      const path = `${id}/${crypto.randomUUID()}.${ALLOWED_TYPES[file.type]}`;
      const { error } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;
      uploaded.push({ path, name: file.name, mime: file.type, size: file.size });
    }
    const values = {
      voucher_date: voucherDate,
      category,
      movement_direction: movementDirection,
      amount,
      currency,
      financial_account_id: category === 'third_party_collection' ? null : optionalText(form.get('accountId')),
      supplier_id: supplierId,
      client_id: clientId,
      order_id: orderIds[0] || null,
      destination_account: destinationAccount,
      counterparty: optionalText(form.get('counterparty')),
      reference: optionalText(form.get('reference')),
      notes: optionalText(form.get('notes')),
      files: [...currentFiles, ...uploaded],
      updated_at: new Date().toISOString()
    };
    const query = existingId
      ? db.from('treasury_vouchers').update({ ...values, status: 'pending', reviewed_by: null, reviewed_at: null }).eq('id', id)
      : db.from('treasury_vouchers').insert({ ...values, id, created_by: user.id });
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    recordSaved = true;
    const { data: oldLinks, error: oldLinksError } = await db.from('treasury_voucher_orders').select('order_id').eq('voucher_id', id);
    if (oldLinksError) throw oldLinksError;
    const oldIds = (oldLinks || []).map(link => link.order_id);
    const addIds = orderIds.filter(orderId => !oldIds.includes(orderId));
    const removeIds = oldIds.filter(orderId => !orderIds.includes(orderId));
    if (addIds.length) {
      const { error: linkError } = await db.from('treasury_voucher_orders').insert(addIds.map(orderId => ({ voucher_id: id, order_id: orderId })));
      if (linkError) throw linkError;
    }
    if (removeIds.length) {
      const { error: unlinkError } = await db.from('treasury_voucher_orders').delete().eq('voucher_id', id).in('order_id', removeIds);
      if (unlinkError) throw unlinkError;
    }
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    if (recordSaved && !existingId) await db.from('treasury_vouchers').delete().eq('id', id);
    if (uploaded.length && (!recordSaved || !existingId)) await db.storage.from(BUCKET).remove(uploaded.map(file => file.path));
    return jsonError(error instanceof Error ? error.message : 'No se pudo guardar el comprobante.', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const context = await authorize(request);
  if (!context) return jsonError('No tenés acceso a comprobantes de tesorería.', 403);
  const { db, user } = context;
  const body = await request.json();
  if (typeof body.id !== 'string') return jsonError('Falta el comprobante.');
  if (!STATUSES.has(body.status)) return jsonError('Estado inválido.');
  const { data, error } = await db.from('treasury_vouchers').update({
    status: body.status,
    reviewed_by: body.status === 'reviewed' ? user.id : null,
    reviewed_at: body.status === 'reviewed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }).eq('id', body.id).select('id,status').maybeSingle();
  if (error || !data) return jsonError(error?.message || 'No se encontró el comprobante.', 404);
  return NextResponse.json({ success: true, voucher: data });
}
