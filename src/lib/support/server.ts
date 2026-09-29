import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyImpersonationTicket } from '@/lib/impersonation';
import { SupportError, databaseError } from './validation';
export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };
// Supabase requests carry private credentials and must bypass Next.js fetch caching.
const privateFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });
export function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: privateHeaders }); }
export async function authorize(request: NextRequest) {
    if (process.env.SUPPORT_ENABLED === 'false')
        throw new SupportError('El módulo de incidencias está temporalmente desactivado.', 503);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token)
        throw new SupportError('La sesión venció. Volvé a ingresar.', 401);
    if (!url || !key)
        throw new SupportError('El módulo de incidencias requiere configuración.', 503);
    const db = createClient(url, key, { global: { fetch: privateFetch, headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error && process.env.NODE_ENV === 'development')
        console.warn('[support] Auth verification failed', { name: error.name, status: error.status, code: error.code });
    if (error && (error.name === 'AuthRetryableFetchError' || !error.status || error.status === 429 || error.status >= 500))
        throw new SupportError('No se pudo verificar la sesión. Revisá la conexión y reintentá.', 503);
    if (error || !user || user.is_anonymous)
        throw new SupportError('La sesión venció. Volvé a ingresar.', 401);
    const pilot = process.env.SUPPORT_PILOT_USER_IDS?.split(',').map(v => v.trim()).filter(Boolean);
    if (pilot?.length && !pilot.includes(user.id))
        throw new SupportError('El módulo de incidencias todavía no está habilitado para tu cuenta.', 403);
    const active = await db.rpc('support_is_active');
    databaseError(active.error);
    if (!active.data) {
        const registered = await db.rpc('support_register_me');
        databaseError(registered.error);
        if (!registered.data)
            throw new SupportError('Tu cuenta no tiene un perfil activo para incidencias.', 403);
    }
    const cookie = request.cookies.get('zono_impersonation')?.value;
    const impersonation = cookie && process.env.SUPABASE_SERVICE_ROLE_KEY ? await verifyImpersonationTicket(cookie, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
    if (request.method !== 'GET' && impersonation?.targetId === user.id)
        throw new SupportError('Volvé a tu cuenta para realizar cambios en incidencias.', 403);
    return { db, user, impersonating: impersonation?.targetId === user.id };
}
export function storageClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        throw new SupportError('No se pudo conectar con el almacenamiento de imágenes.', 503);
    return createClient(url, key, { global: { fetch: privateFetch }, auth: { persistSession: false, autoRefreshToken: false } });
}
export async function body(request: NextRequest) {
    if (Number(request.headers.get('content-length')) > 60000)
        throw new SupportError('El mensaje es demasiado extenso.', 413);
    const raw = await request.text();
    if (raw.length > 60000)
        throw new SupportError('El mensaje es demasiado extenso.', 413);
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new SupportError('Los datos enviados no son válidos.');
    }
}
