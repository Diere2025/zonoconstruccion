export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateSystemAdministrator } from '@/lib/systemAdminAccess';
import { erpModules, isConfigurableScreen } from '@/lib/erpNavigation';
import { validateScreenOverrides } from '@/lib/roleScreenAccess';

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar el acceso al servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } });
}

export async function GET(request: Request) {
  try {
    const db = client();
    if (new URL(request.url).searchParams.get('manage') === '1') {
      const auth = await authenticateSystemAdministrator(request, db);
      if (!auth.user) return response({ error: auth.error }, auth.status);
    }
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response({ error: 'Iniciá sesión para consultar los accesos.' }, 401);
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return response({ error: 'La sesión venció. Volvé a ingresar.' }, 401);
    const { data, error } = await db.from('erp_role_screen_access').select('overrides,revision,updated_at').eq('id', true).single();
    // Before migration, keep the existing navigation; editing remains unavailable.
    if (error && ['42P01', 'PGRST205'].includes(error.code)) return response({ overrides: {}, revision: 0, available: false });
    if (error || !data) throw error || new Error('Configuración inexistente.');
    const ids = new Set(erpModules.flatMap(module => module.links.filter(isConfigurableScreen).map(link => link.id)));
    if (!validateScreenOverrides(data.overrides, ids)) throw new Error('Configuración inválida.');
    return response({ ...data, available: true });
  } catch {
    return response({ error: 'No se pudieron cargar los accesos. Volvé a intentar.' }, 503);
  }
}

export async function PUT(request: Request) {
  try {
    const db = client();
    const auth = await authenticateSystemAdministrator(request, db);
    if (!auth.user) return response({ error: auth.error }, auth.status);
    let body;
    try { body = await request.json(); } catch { return response({ error: 'La configuración enviada no es válida.' }, 400); }
    const ids = new Set(erpModules.flatMap(module => module.links.filter(isConfigurableScreen).map(link => link.id)));
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || !validateScreenOverrides(body.overrides, ids)) {
      return response({ error: 'La configuración enviada contiene roles o pantallas inválidos.' }, 400);
    }
    const { data, error } = await db.rpc('save_erp_role_screen_access', {
      p_overrides: body.overrides, p_revision: body.revision, p_actor: auth.user.id,
    });
    if (error?.code === '40001') return response({ error: 'Otro administrador modificó los accesos. Recargá la configuración antes de guardar.' }, 409);
    if (error) throw error;
    return response({ overrides: data.overrides, revision: data.revision, updated_at: data.updated_at, available: true });
  } catch {
    return response({ error: 'No se pudieron guardar los accesos. Verificá que la migración de accesos esté aplicada.' }, 503);
  }
}
