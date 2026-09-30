export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { DEFAULT_ORDER_NOTE_RATES } from '@/lib/logisticsOrderNotes';
import { CUOTA_SIMPLE_PLANS, POINT_ONE_PAYMENT_PLAN } from '@/lib/cuotaSimple';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const knownAdminEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

class SessionVerificationUnavailable extends Error {}

function response(data: unknown, status = 200) {
  const result = NextResponse.json(data, { status });
  result.headers.set('Cache-Control', 'no-store, max-age=0');
  return result;
}

function adminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso al servidor.');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
  });
}

async function authenticatedUser(request: NextRequest): Promise<User | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data: { user }, error } = await adminClient().auth.getUser(token);
  if (error && (error.name === 'AuthRetryableFetchError' || !error.status || error.status === 429 || error.status >= 500)) {
    throw new SessionVerificationUnavailable('No se pudo verificar la sesión. Reintentá en unos momentos.');
  }
  return error ? null : user;
}

async function mayEdit(user: User): Promise<boolean> {
  if (user.email && knownAdminEmails.has(user.email.toLowerCase())) return true;
  const { data: seller, error } = await adminClient()
    .from('sellers')
    .select('role, roles')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return seller?.role === 'admin' || (Array.isArray(seller?.roles) && seller.roles.includes('admin'));
}

function validRates(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === CUOTA_SIMPLE_PLANS.length
    && value.every(rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 300);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return response({ error: 'Iniciá sesión para consultar los recargos de cuotas.' }, 401);
    const client = adminClient();
    const canEditPromise = mayEdit(user).catch(roleError => {
      console.warn('[NotaPedidoConfig] No se pudo verificar permiso de edición:', roleError);
      return false;
    });
    const { data, error } = await client.from('payment_methods').select('name, surcharge_percentage')
      .eq('is_active', true).in('name', [...CUOTA_SIMPLE_PLANS.map(plan => plan.name), POINT_ONE_PAYMENT_PLAN.name]);
    if (error) throw error;
    const rates = CUOTA_SIMPLE_PLANS.map((plan, index) => {
      const method = data?.find(method => method.name === plan.name);
      return method ? Number(method.surcharge_percentage) : DEFAULT_ORDER_NOTE_RATES[index];
    });
    if (!validRates(rates)) throw new Error('La configuración de cuotas guardada no es válida.');
    const pointRate = Number(data?.find(method => method.name === POINT_ONE_PAYMENT_PLAN.name)?.surcharge_percentage ?? POINT_ONE_PAYMENT_PLAN.surcharge_percentage);
    if (!Number.isFinite(pointRate) || pointRate < 0 || pointRate > 300) throw new Error('El recargo de Point guardado no es válido.');
    const canEdit = await canEditPromise;
    return response({ rates, pointRate, canEdit });
  } catch (error) {
    if (error instanceof SessionVerificationUnavailable) return response({ error: error.message }, 503);
    console.error('[NotaPedidoConfig] Error de lectura:', error);
    return response({ error: 'No se pudo cargar la configuración de cuotas.' }, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return response({ error: 'Iniciá sesión para guardar los recargos de cuotas.' }, 401);
    if (!await mayEdit(user)) return response({ error: 'Solo un administrador puede modificar los recargos de cuotas.' }, 403);

    const body = await request.json() as { rates?: unknown };
    if (!validRates(body.rates)) {
      return response({ error: `Ingresá ${CUOTA_SIMPLE_PLANS.length} recargos válidos entre 0% y 300%.` }, 400);
    }

    const client = adminClient();
    for (const [index, plan] of CUOTA_SIMPLE_PLANS.entries()) {
      const { error } = await client.from('payment_methods').update({ surcharge_percentage: body.rates[index] })
        .eq('name', plan.name).eq('is_active', true);
      if (error) throw error;
    }
    return response({ rates: body.rates, canEdit: true });
  } catch (error) {
    if (error instanceof SessionVerificationUnavailable) return response({ error: error.message }, 503);
    console.error('[NotaPedidoConfig] Error al guardar:', error);
    return response({ error: 'No se pudieron guardar los recargos de cuotas.' }, 500);
  }
}
