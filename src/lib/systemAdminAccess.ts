import type { SupabaseClient, User } from '@supabase/supabase-js';

const administratorEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

/** Resolve permissions from the authenticated identity and server-owned profile. */
export async function authenticateSystemAdministrator(request: Request, client: SupabaseClient): Promise<
  { user: User; status?: never; error?: never } | { user: null; status: number; error: string }
> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { user: null, status: 401, error: 'La sesión venció. Volvé a ingresar.' };
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { user: null, status: 401, error: 'La sesión venció. Volvé a ingresar.' };

  const profile = () => client.from('sellers').select('role,roles,is_active');
  const byId = await profile().eq('id', user.id).maybeSingle();
  if (byId.error) return { user: null, status: 503, error: 'No se pudieron verificar los permisos de administrador.' };
  const seller = byId.data || !user.email ? byId
    : await profile().ilike('email', user.email.toLowerCase().replace(/[%_]/g, '\\$&')).maybeSingle();
  if (seller.error) return { user: null, status: 503, error: 'No se pudieron verificar los permisos de administrador.' };

  const roles = [seller.data?.role, ...(Array.isArray(seller.data?.roles) ? seller.data.roles : [])]
    .map(role => String(role || '').trim().toLowerCase());
  const appRoles = [user.app_metadata?.role, ...(Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : [])]
    .map(role => String(role || '').trim().toLowerCase());
  const allowed = seller.data?.is_active !== false && (roles.includes('admin') || appRoles.includes('admin')
    || administratorEmails.has((user.email || '').trim().toLowerCase()));
  return allowed ? { user } : { user: null, status: 403, error: 'Acceso denegado: solo los administradores del sistema pueden gestionar los vendedores.' };
}
