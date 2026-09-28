import { createClient } from '@supabase/supabase-js';

const administratorEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

/** Validate the session and consult server-owned roles before accessing management reports. */
export async function requireFinanceAdmin(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401, error: 'La sesión venció. Volvé a ingresar.' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return { status: 503, error: 'No se pudo verificar el acceso a Dirección General.' };

  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) return { status: 401, error: 'La sesión venció. Volvé a ingresar.' };
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const byId = await db.from('sellers').select('role,roles,is_active').eq('id', user.id).maybeSingle();
  const seller = byId.data ? byId : user.email
    ? await db.from('sellers').select('role,roles,is_active').ilike('email', user.email.replace(/[%_]/g, '\\$&')).maybeSingle()
    : byId;
  if (byId.error || seller.error) return { status: 503, error: 'No se pudo verificar el acceso a Dirección General.' };
  const roles = [seller.data?.role, ...(Array.isArray(seller.data?.roles) ? seller.data.roles : [])]
    .map(value => String(value || '').trim().toLowerCase());
  const allowed = seller.data?.is_active !== false && (roles.includes('admin')
    || administratorEmails.has((user.email || '').toLowerCase())
    || user.app_metadata?.role === 'admin');
  if (!allowed) return { status: 403, error: 'Estado de Resultados está disponible solo para administradores.' };
  return null;
}
