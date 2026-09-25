export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { DEFAULT_ORDER_NOTE_RATES } from '@/lib/logisticsOrderNotes';

const SETTING_ID = 'logistics_payway_rates';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const knownAdminEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

function response(data: unknown, status = 200) {
  const result = NextResponse.json(data, { status });
  result.headers.set('Cache-Control', 'no-store, max-age=0');
  return result;
}

function adminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso al servidor.');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function authenticatedUser(request: NextRequest): Promise<User | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data: { user }, error } = await adminClient().auth.getUser(token);
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
    && value.length === 5
    && value.every(rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 300);
}

function savedRates(value: unknown): number[] {
  const stored = value && typeof value === 'object' && 'rates' in value ? value.rates : null;
  if (Array.isArray(stored) && stored.length === 4) {
    const migrated = [...stored, DEFAULT_ORDER_NOTE_RATES[4]];
    if (validRates(migrated)) return migrated;
  }
  const rates = stored ?? [...DEFAULT_ORDER_NOTE_RATES];
  if (!validRates(rates)) throw new Error('La configuración de cuotas guardada no es válida.');
  return rates;
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
    const { data, error } = await client.from('site_settings').select('value').eq('id', SETTING_ID).maybeSingle();
    if (error) throw error;
    const saved = data?.value
      ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)
      : null;
    const rates = savedRates(saved);
    const canEdit = await canEditPromise;
    return response({ rates, canEdit });
  } catch (error) {
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
      return response({ error: 'Ingresá cinco recargos válidos entre 0% y 300%.' }, 400);
    }

    const { error } = await adminClient().from('site_settings').upsert({
      id: SETTING_ID,
      value: JSON.stringify({ rates: body.rates }),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw error;
    return response({ rates: body.rates, canEdit: true });
  } catch (error) {
    console.error('[NotaPedidoConfig] Error al guardar:', error);
    return response({ error: 'No se pudieron guardar los recargos de cuotas.' }, 500);
  }
}
