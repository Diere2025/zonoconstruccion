import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { FUTURE_DEVELOPMENTS_OWNER_ID, futureDevelopmentStatuses, type FutureDevelopmentStatus } from './futureDevelopments';

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' };

export function futureResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: privateHeaders });
}

export async function authorizeFutureDevelopments(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: futureResponse({ error: 'Iniciá sesión para continuar.' }, 401) } as const;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { error: futureResponse({ error: 'El módulo no está configurado.' }, 503) } as const;
  const db = createClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error && (!error.status || error.status === 429 || error.status >= 500)) {
    return { error: futureResponse({ error: 'No se pudo verificar la sesión. Reintentá.' }, 503) } as const;
  }
  if (error || !user || user.is_anonymous) return { error: futureResponse({ error: 'La sesión venció.' }, 401) } as const;
  if (user.id !== FUTURE_DEVELOPMENTS_OWNER_ID) return { error: futureResponse({ error: 'No tenés acceso a este módulo.' }, 403) } as const;
  const owner = await db.from('sellers').select('is_active').eq('id', user.id).maybeSingle();
  if (owner.error) return { error: futureResponse({ error: 'No se pudo verificar el acceso.' }, 503) } as const;
  if (!owner.data || owner.data.is_active === false) return { error: futureResponse({ error: 'No tenés acceso a este módulo.' }, 403) } as const;
  return { db, user } as const;
}

export function parseFutureDocument(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const content = data.content_md;
  const status = data.status;
  if (title.length < 3 || title.length > 180 || typeof content !== 'string' || content.length > 200000 ||
      typeof status !== 'string' || !Object.prototype.hasOwnProperty.call(futureDevelopmentStatuses, status)) return null;
  return { title, content_md: content, status: status as FutureDevelopmentStatus };
}

export async function readFutureBody(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > 250000) return null;
  const raw = await request.text();
  if (raw.length > 250000) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}
