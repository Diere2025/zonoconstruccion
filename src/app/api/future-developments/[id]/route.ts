import { type NextRequest } from 'next/server';
import { authorizeFutureDevelopments, futureResponse, parseFutureDocument, readFutureBody } from '@/lib/futureDevelopmentsServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await authorizeFutureDevelopments(request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return futureResponse({ error: 'Documento no encontrado.' }, 404);
  const result = await auth.db.from('future_development_documents').select('*')
    .eq('id', id).eq('owner_id', auth.user.id).maybeSingle();
  if (result.error) return futureResponse({ error: 'No se pudo cargar el documento.' }, 503);
  if (!result.data) return futureResponse({ error: 'Documento no encontrado.' }, 404);
  return futureResponse(result.data);
}

export async function PUT(request: NextRequest, context: Context) {
  const auth = await authorizeFutureDevelopments(request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return futureResponse({ error: 'Documento no encontrado.' }, 404);
  const raw = await readFutureBody(request);
  const document = parseFutureDocument(raw);
  const version = raw && typeof raw === 'object' && 'version' in raw ? raw.version : null;
  if (!document || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    return futureResponse({ error: 'Revisá el título, el estado y el contenido.' }, 400);
  const result = await auth.db.from('future_development_documents')
    .update({ ...document, version: version + 1, updated_at: new Date().toISOString() })
    .eq('id', id).eq('owner_id', auth.user.id).eq('version', version).select('*').maybeSingle();
  if (result.error) return futureResponse({ error: 'No se pudo guardar el documento.' }, 503);
  if (!result.data) return futureResponse({ error: 'El documento cambió en otra sesión. Recargalo antes de guardar.' }, 409);
  return futureResponse(result.data);
}
