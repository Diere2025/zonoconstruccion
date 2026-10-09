import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePurchaseOperator } from '@/lib/purchaseAccess';
import { isUuid } from '@/lib/supplierAccount';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
const BUCKET = 'supplier-receipts';
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const fail = (error: unknown, status = 500) => NextResponse.json({ error: (error as {message?: string})?.message || 'No se pudo guardar el adjunto.' }, {status});

async function access(request: Request, id: string | null, authorized = false) {
  const denied = authorized ? null : await requirePurchaseOperator(request);
  if (denied) return {response: NextResponse.json({error: denied.error}, {status: denied.status})};
  if (!id || !isUuid(id)) return {response: fail(new Error('Recepción inválida.'), 400)};
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data, error} = await db.from('purchase_receptions').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return {response: fail(new Error('No se encontró la recepción.'), 404)};
  return {db, id};
}

export async function GET(request: Request) {
  try {
    const context = await access(request, new URL(request.url).searchParams.get('id'));
    if (context.response) return context.response;
    const {db, id} = context;
    const bucket = await db.storage.getBucket(BUCKET);
    if (bucket.error) {
      if (String(bucket.error.message).toLowerCase().includes('not found')) return NextResponse.json({files: []});
      throw bucket.error;
    }
    const {data, error} = await db.storage.from(BUCKET).list(id, {limit: 100});
    if (error) throw error;
    const files = await Promise.all((data || []).filter(f => f.id).map(async file => {
      const {data: signed, error: signError} = await db.storage.from(BUCKET).createSignedUrl(id + '/' + file.name, 900);
      if (signError) throw signError;
      return {name: file.name.slice(65), url: signed.signedUrl};
    }));
    return NextResponse.json({files});
  } catch (error) {return fail(error);}
}

export async function POST(request: Request) {
  try {
    // Authorize before accepting the multipart body.
    const denied = await requirePurchaseOperator(request);
    if (denied) return NextResponse.json({error: denied.error}, {status: denied.status});
    const form = await request.formData();
    const context = await access(request, String(form.get('id') || ''), true);
    if (context.response) return context.response;
    const {db, id} = context;
    const values = form.getAll('files');
    if (!values.length || values.length > 5 || values.some(f => !(f instanceof File) || !f.size || f.size > MAX_BYTES || !TYPES.includes(f.type)))
      return fail(new Error('Adjuntá hasta 5 imágenes, PDF o Word de hasta 10 MB cada uno.'), 400);
    const bucket = await db.storage.getBucket(BUCKET);
    if (bucket.error) {
      if (!String(bucket.error.message).toLowerCase().includes('not found')) throw bucket.error;
      const created = await db.storage.createBucket(BUCKET, {public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: TYPES});
      if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error;
    }
    const {data: existing, error: listError} = await db.storage.from(BUCKET).list(id, {limit: 100});
    if (listError) throw listError;
    const uploads = await Promise.all((values as File[]).map(async file => {
      const bytes = await file.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-140) || 'archivo';
      return {key: hash + '-' + name, bytes, type: file.type};
    }));
    const names = new Set((existing || []).filter(f => f.id).map(f => f.name));
    uploads.forEach(file => names.add(file.key));
    if (names.size > 5) return fail(new Error('La recepción admite hasta 5 adjuntos en total.'), 400);
    // Content-based names make a retry safe after a partial upload.
    for (const file of uploads) {
      const {error} = await db.storage.from(BUCKET).upload(id + '/' + file.key, file.bytes, {contentType: file.type, upsert: true});
      if (error) throw error;
    }
    return NextResponse.json({ok: true});
  } catch (error) {return fail(error);}
}
