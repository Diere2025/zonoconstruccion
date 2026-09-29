import { type NextRequest } from 'next/server';
import { authorizeFutureDevelopments, futureResponse, parseFutureDocument, readFutureBody } from '@/lib/futureDevelopmentsServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await authorizeFutureDevelopments(request);
  if ('error' in auth) return auth.error;
  const result = await auth.db.from('future_development_documents')
    .select('id,slug,title,status,version,created_at,updated_at')
    .eq('owner_id', auth.user.id).order('updated_at', { ascending: false }).limit(100);
  if (result.error) return futureResponse({ error: 'No se pudieron cargar los documentos.' }, 503);
  return futureResponse({ items: result.data });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeFutureDevelopments(request);
  if ('error' in auth) return auth.error;
  const raw = await readFutureBody(request);
  const document = parseFutureDocument(raw);
  const id = raw && typeof raw === 'object' && 'id' in raw ? raw.id : null;
  if (!document || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return futureResponse({ error: 'Revisá el título, el estado y el contenido.' }, 400);
  const slugBase = document.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-$/g, '') || 'documento';
  const slug = `${slugBase}-${id.slice(0, 8)}`;
  const result = await auth.db.from('future_development_documents')
    .insert({ id, owner_id: auth.user.id, slug, ...document }).select('*').single();
  if (result.error?.code === '23505') {
    const existing = await auth.db.from('future_development_documents').select('*')
      .eq('id', id).eq('owner_id', auth.user.id).maybeSingle();
    if (!existing.error && existing.data && existing.data.title === document.title &&
        existing.data.content_md === document.content_md && existing.data.status === document.status)
      return futureResponse(existing.data);
    return futureResponse({ error: 'El documento cambió. Volvé a cargar la lista.' }, 409);
  }
  if (result.error) return futureResponse({ error: 'No se pudo guardar el documento.' }, 503);
  return futureResponse(result.data, 201);
}
