import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyImpersonationTicket } from '@/lib/impersonation';
import { VisitsError } from './validation';
import { sortVisitKits } from './model';
import type { VisitsMe } from './model';
import type { NextRequest } from 'next/server';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, Cookie' };
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const errors: Record<string, [string, number]> = {
  VISITS_FORBIDDEN: ['Tu cuenta no tiene acceso a seguimiento de visitas.', 403],
  VISITS_NOT_FOUND: ['La visita no existe o no tenés acceso.', 404],
  VISITS_CONFLICT: ['La ficha cambió. Actualizala antes de guardar; tus datos siguen en el formulario.', 409],
  VISITS_KIT_REQUIRED: ['Seleccioná un kit de instalación activo del catálogo.', 400],
  VISITS_KIT_REASON: ['Explicá por qué se cambió el kit.', 400],
  VISITS_REQUIRED: ['Completá los datos obligatorios de la acción.', 400],
  VISITS_LOSS_REQUIRED: ['Indicá el motivo de la venta no concretada.', 400],
  VISITS_FOLLOWUP_REQUIRED: ['Indicá próxima acción, fecha y responsable del seguimiento.', 400],
  VISITS_PERSON_INVALID: ['El responsable no está habilitado para esta función.', 400],
  VISITS_CONFIRM_REQUIRED: ['Para confirmar, asigná instalador, completá dirección y registrá el acuerdo del cliente y del instalador.', 400],
  VISITS_SCHEDULE_CONFLICT: ['El instalador ya tiene una visita confirmada en esa franja horaria.', 409],
  VISITS_REASSIGN_SCHEDULE: ['Cancelá o reprogramá las visitas confirmadas antes de cambiar el instalador.', 409],
  VISITS_REOPEN_REQUIRED: ['Reabrí el seguimiento antes de coordinar otra visita o cambiar kit/presupuesto.', 400],
  VISITS_QUOTE_REVIEW: ['Revisá el presupuesto vigente: debe estar enviado, corresponder al kit aceptado y no estar vencido.', 400],
  VISITS_ORDER_FORBIDDEN: ['El pedido no existe o no tenés permiso para vincularlo.', 403],
  VISITS_INVALID: ['Revisá los datos, fechas e importes de la acción.', 400],
};
export function dbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  const match = Object.keys(errors).find(code => error.message.includes(code));
  if (match) throw new VisitsError(...errors[match]);
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '')) throw new VisitsError('El módulo requiere activar la migración de visitas en la base del ERP.', 503);
  if (error.code?.startsWith('22') || error.code === '23514') throw new VisitsError('Revisá los datos obligatorios, fechas e importes.', 400);
  throw new VisitsError('No se pudo completar la operación. Reintentá o avisá a administración.', 503);
}
export async function authorize(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new VisitsError('La sesión venció. Volvé a ingresar.', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new VisitsError('No se pudo conectar con el ERP.', 503);
  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }, auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data.user || auth.data.user.is_anonymous) throw new VisitsError('La sesión venció. Volvé a ingresar.', 401);
  const cookie = request.cookies.get('zono_impersonation')?.value;
  const impersonation = cookie && process.env.SUPABASE_SERVICE_ROLE_KEY ? await verifyImpersonationTicket(cookie, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
  // A signed “Ver como” session may operate with the target's existing permissions.
  // Record the administrator separately; never grant extra privileges to the target.
  if (impersonation?.targetId === auth.data.user.id) {
    const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = await service.from('sellers').select('role,roles,is_active').eq('id', impersonation.administratorId).maybeSingle();
    if (admin.error || !admin.data?.is_active || ![admin.data.role, ...(admin.data.roles || [])].includes('admin')) throw new VisitsError('La sesión Ver como ya no está autorizada.', 403);
  }
  const me = await db.rpc('visits_session'); dbError(me.error);
  const profile = me.data as VisitsMe; profile.kits=sortVisitKits(profile.kits);
  return { db, me: profile, user: auth.data.user, impersonation };
}
export function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new VisitsError('No se pudieron habilitar los archivos adjuntos.', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from('visit-attachments');
}
export function failure(error: unknown) { return error instanceof VisitsError ? json({ error: error.message }, error.status) : json({ error: 'No se pudo completar la operación.' }, 500); }
