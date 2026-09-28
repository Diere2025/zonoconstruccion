type ProfileResult<T> = { data: T | null; error: { message: string } | null };

export interface UserRoleProfile {
  id: string;
  role: string | null;
  roles: unknown;
  full_name?: string | null;
  seller_type?: string | null;
  can_sell_wholesale?: boolean | null;
}

/** A failed lookup is not a seller role. Prefer the authenticated ID over email. */
export async function loadUserRoleProfile<T>(
  user: { id: string; email?: string },
  byId: (id: string) => PromiseLike<ProfileResult<T>>,
  byEmail: (email: string) => PromiseLike<ProfileResult<T>>,
): Promise<T> {
  const result = await byId(user.id);
  if (result.error) throw new Error(result.error.message);
  if (result.data) return result.data;
  if (user.email) {
    const fallback = await byEmail(user.email.toLowerCase().replace(/[%_]/g, '\\$&'));
    if (fallback.error) throw new Error(fallback.error.message);
    if (fallback.data) return fallback.data;
  }
  throw new Error('No se encontró el perfil de permisos de la cuenta.');
}
