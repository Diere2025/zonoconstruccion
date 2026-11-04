import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
export async function outletSession(req: NextRequest, admin = false) {
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
        throw new Error('Volvé a ingresar al ERP.');
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user || auth.data.user.is_anonymous)
        throw new Error('Volvé a ingresar al ERP.');
    const access = await db.rpc(admin ? 'outlet_is_admin' : 'outlet_can_sell');
    if (access.error)
        throw new Error('Segunda y Outlet todavía no está habilitado.');
    if (!access.data)
        throw new Error('Tu cuenta no tiene acceso a esta operación.');
    return { db, user: auth.data.user };
}
