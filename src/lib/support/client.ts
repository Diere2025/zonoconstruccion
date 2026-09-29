'use client';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
export class RequestError extends Error {
    constructor(message: string, public status: number) { super(message); }
}
let renewal: Promise<Session | null> | null = null;
async function response(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session)
        throw new RequestError('La sesión venció. Volvé a ingresar.', 401);
    const userId = session.user.id;
    const send = (token: string) => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);
        if (typeof options.body === 'string')
            headers.set('Content-Type', 'application/json');
        return fetch(`/api/support/${path}`, { ...options, headers, cache: 'no-store' });
    };
    let result = await send(session.access_token);
    if (result.status === 401) {
        let next = (await supabase.auth.getSession()).data.session;
        if (next?.user.id !== userId)
            throw new RequestError('La cuenta cambió. Volvé a abrir la incidencia.', 401);
        // Another request or tab may already have renewed the rejected token.
        if (next.access_token === session.access_token) {
            if (!renewal)
                renewal = supabase.auth.refreshSession().then(({ data, error }) => {
                    if (error && (!error.status || error.status === 429 || error.status >= 500))
                        throw new RequestError('No se pudo renovar la sesión. Revisá la conexión y reintentá.', 503);
                    return data.session;
                }).finally(() => { renewal = null; });
            next = await renewal;
        }
        if (next?.user.id === userId)
            result = await send(next.access_token);
    }
    const latest = await supabase.auth.getSession();
    if (latest.data.session?.user.id !== userId)
        throw new RequestError('La cuenta cambió. Volvé a abrir la incidencia.', 401);
    if (!result.ok) {
        const payload = await result.json().catch(() => ({ error: 'No se pudo completar la operación.' }));
        throw new RequestError(payload.error || 'No se pudo completar la operación.', result.status);
    }
    return result;
}
export async function supportRequest<T>(path: string, options?: RequestInit): Promise<T> { return (await response(path, options)).json() as Promise<T>; }
export async function supportImage(id: string): Promise<string> { return URL.createObjectURL(await (await response(`attachments/${id}`)).blob()); }
export function commandBody(payload: Record<string, unknown>, version?: number, action?: string, key = crypto.randomUUID()) {
    return JSON.stringify({ payload, expectedVersion: version, action, idempotencyKey: key });
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';
